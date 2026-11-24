import { workflowSchemaResolver } from "./schema";
import { SchemaResolutionError } from "@bernouy/ulvia-contracts/resolution";
import { resolveWorkflowCall } from "@bernouy/workflows";
import { projectSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { EventDefinitions, EventSubscriptions, EventsError, resolveEventSchema } from "@bernouy/cms-events";
import type { EventServices } from "@bernouy/cms-events";
import { capabilityGranted } from "@bernouy/ulvia-providers/selections";
import { withSiteWriteFence } from "@bernouy/repository/upgrades";
import { fencedWorkflowStore } from "./fencedStore";
import { WorkflowRunner, WorkflowTriggers, WorkflowInstallations, WorkflowError } from "@bernouy/workflows";
import type { WorkflowServices } from "@bernouy/workflows";
import { MongoWorkflowStore, MongoWorkflowValues, MongoWorkflowInstallations } from "@bernouy/workflows/mongo";
import type { createProviderGateway } from "../../gateway/createProviderGateway";
import type { ProviderStores } from "../../stores/providerStores";
import { MongoProviderOperationStore } from "../../provider-operations/MongoProviderOperationStore";
import { workflowAuthority } from "./authority";
export async function composeWorkflows(options: {
    events: EventServices;
    artifacts: WorkflowServices["artifacts"];
    instanceId: string;
    providerId: string;
    stores: ProviderStores;
    gateway: Awaited<ReturnType<typeof createProviderGateway>>;
}) {
    const { stores, gateway, instanceId, providerId } = options;
    const values = new MongoWorkflowValues(stores.db, stores.fieldCrypto);
    const store = new MongoWorkflowStore(stores.db, values);
    await store.open();
    const installationMutations = ["create", "replace", "markPublished", "finishPublication"];
    const installationStore = withSiteWriteFence(
        await new MongoWorkflowInstallations(stores.db).init(),
        stores.upgradeStorage,
        gateway.siteId,
        installationMutations,
        installationMutations,
    );
    const operations = new MongoProviderOperationStore(stores.db);
    const owner = async () => {
        const route = await gateway.routes.resolve(gateway.siteId, "ulvia/cms.workflows");
        if (
            !route ||
            route.installation.installation.providerId !== providerId ||
            route.installation.installation.accountId !== instanceId ||
            !(await gateway.routes.isCurrent(route))
        ) {
            throw new WorkflowError("FORBIDDEN");
        }
        return {
            siteId: gateway.siteId,
            installationId: route.selection.installationId,
            consumerContractId: "ulvia/cms.workflows",
        };
    };
    const abort = new AbortController();
    let stopped = false;
    const authority = workflowAuthority(gateway, instanceId, providerId);
    const services: WorkflowServices = {
        store,
        values,
        installationStore,
        artifacts: options.artifacts,
        authority,
        now: Date.now,
        domainSubscriptions: {
            ensure: async (id, configuration, revision) => {
                try {
                    return await new EventSubscriptions(options.events).ensure(
                        await owner(),
                        id,
                        revision,
                        configuration,
                    );
                } catch (error) {
                    throw error instanceof EventsError
                        ? new WorkflowError(
                              error.code === "SUBSCRIPTION_CONFLICT" ? "TRIGGER_CONFLICT" : "PLAN_UNAVAILABLE",
                          )
                        : error;
                }
            },
            disable: async (id) => {
                const scoped = await owner();
                const current = await options.events.store.subscription(scoped, id);
                if (!current || current.deleted || !current.enabled) {
                    return { revision: current?.revision ?? 0 };
                }
                return new EventSubscriptions(options.events).update(scoped, id, current.revision, {
                    definitionId: current.definitionId,
                    definitionDigest: current.definitionDigest,
                    ...(current.filterJson === undefined ? {} : { filterJson: current.filterJson }),
                    enabled: false,
                    delivery: current.delivery,
                });
            },
            remove: async (id) => {
                await new EventSubscriptions(options.events).cancel(await owner(), id);
            },
        },
        contracts: {
            async resolveEvent(contractId, eventType) {
                const source = await gateway.routes.resolve(gateway.siteId, contractId);
                if (!source) {
                    const selected = await gateway.selections.get(gateway.siteId);
                    const installed =
                        selected?.plan.selections.some((pin) => pin.contractId === contractId) ||
                        selected?.plan.authority.capabilities.some((entry) => entry.contractId === contractId);
                    throw new WorkflowError(
                        installed ? "CORE_UNAVAILABLE" : "INVALID_DEFINITION",
                        "trigger.eventUnavailable",
                    );
                }
                if (!(await gateway.routes.isCurrent(source))) {
                    throw new WorkflowError("CORE_UNAVAILABLE");
                }
                try {
                    return await new EventDefinitions(options.events).resolve(
                        {
                            siteId: gateway.siteId,
                            installationId: source.selection.installationId,
                            namespace: contractId,
                        },
                        eventType,
                    );
                } catch (error) {
                    if (
                        error instanceof EventsError &&
                        ["NOT_FOUND", "DEFINITION_CONFLICT", "DEFINITION_RETIRED"].includes(error.code)
                    ) {
                        throw new WorkflowError("INVALID_DEFINITION", "trigger.eventUnavailable");
                    }
                    throw new WorkflowError("CORE_UNAVAILABLE");
                }
            },
            async resolveEventSchema(definition, value, allowLatest) {
                try {
                    return await resolveEventSchema(options.events, definition, value, allowLatest);
                } catch (error) {
                    if (error instanceof SchemaResolutionError && error.code === "INVALID_SELECTOR") {
                        throw error;
                    }
                    if (error instanceof SchemaResolutionError && error.code === "SCHEMA_VERSION_CONFLICT") {
                        throw new WorkflowError("RESOURCE_SCHEMA_CHANGED", "trigger.resource.version");
                    }
                    if (
                        error instanceof EventsError &&
                        ["NOT_FOUND", "INVALID_INPUT", "DEFINITION_CONFLICT"].includes(error.code)
                    ) {
                        throw new WorkflowError("INVALID_DEFINITION", "trigger.resourceUnavailable");
                    }
                    throw new WorkflowError("CORE_UNAVAILABLE");
                }
            },
            resolveSchema: workflowSchemaResolver(gateway, stores),
            async resolve(contractId, capabilityId) {
                const route = await gateway.routes.resolve(gateway.siteId, contractId);
                const capability = route?.requestedRelease.admission.release.capabilities.find(
                    ({ id }) => id === capabilityId,
                );
                const selected = await gateway.selections.get(gateway.siteId);
                const installation = route?.installation.installation;
                const targetInstance = route?.installation.observation?.report.instanceId;
                if (!route) {
                    const installed = selected?.plan.authority.capabilities.some(
                        (entry) => entry.contractId === contractId && entry.capabilityId === capabilityId,
                    );
                    throw new WorkflowError(
                        installed ? "CORE_UNAVAILABLE" : "INVALID_DEFINITION",
                        "capabilities.unavailable",
                    );
                }
                if (
                    !capability ||
                    !selected ||
                    !capabilityGranted(selected.grants, route.selection.contractId, capabilityId)
                ) {
                    throw new WorkflowError("INVALID_DEFINITION", `capabilities.${capabilityId}`);
                }
                if (!installation || !targetInstance || !(await gateway.routes.isCurrent(route))) {
                    throw new WorkflowError("CORE_UNAVAILABLE");
                }
                return {
                    capability,
                    operationReadable:
                        installation.providerId === providerId &&
                        installation.accountId === instanceId &&
                        targetInstance === instanceId,
                    target: {
                        installationId: installation.id,
                        contractId,
                        capabilityId,
                        version: route.requestedRelease.admission.release.version,
                        digest: route.requestedRelease.admission.digest,
                        endpoint: installation.endpoint,
                        accountId: installation.accountId,
                        instanceId: targetInstance,
                    },
                };
            },
        },
        execution: {
            async invoke(resolved, input, administratorId, idempotencyKey, causation) {
                await authority.assertAdministrator(administratorId);
                const current = await resolveWorkflowCall(
                    resolved,
                    services.contracts,
                    `capabilities.${resolved.capability.id}`,
                );
                const result = await gateway.invoker.invoke({
                    siteId: gateway.siteId,
                    contractId: current.target.contractId,
                    capabilityId: current.target.capabilityId,
                    expectedTarget: {
                        installationId: current.target.installationId,
                        endpoint: current.target.endpoint,
                        accountId: current.target.accountId,
                        instanceId: current.target.instanceId,
                        version: current.target.version,
                        digest: current.target.digest,
                    },
                    input,
                    signal: abort.signal,
                    ...(causation ? { eventCausation: causation } : {}),
                    actor: { kind: "administrator", subjectId: administratorId },
                    ...(idempotencyKey ? { idempotencyKey } : {}),
                });
                return result.kind === "success" && resolved.capability.behavior.execution === "sync"
                    ? { ...result, output: projectSchemaValue(resolved.capability.output, result.output) }
                    : result;
            },
            async operation(resolved, operationId) {
                const record = resolved.operationReadable ? await operations.get(gateway.siteId, operationId) : null;
                if (
                    !record ||
                    record.context.invocation?.instanceId !== instanceId ||
                    record.context.connectionId !== resolved.target.installationId ||
                    record.contractId !== resolved.target.contractId ||
                    record.context.contractVersion !== resolved.target.version ||
                    record.capabilityId !== resolved.target.capabilityId
                ) {
                    throw new WorkflowError("PLAN_UNAVAILABLE");
                }
                return record.status === "succeeded"
                    ? { state: "succeeded", output: record.result }
                    : record.status === "failed"
                      ? { state: "failed", errorCode: record.errorCode, errorOutput: record.errorOutput }
                      : { state: "waiting" };
            },
        },
    };
    Object.assign(services, { store: fencedWorkflowStore(store, services, stores.upgradeStorage, gateway.siteId) });
    const runner = new WorkflowRunner(services, { leaseMs: 30000, retryMs: 5000, maxAttempts: 12 });
    const triggers = new WorkflowTriggers(services);
    let triggerCursor: string | undefined;
    let healthCursor: string | undefined;
    return {
        services,
        async stop() {
            stopped = true;
            abort.abort();
        },
        async tick(limit: number) {
            if (stopped) {
                return 0;
            }
            await store.purgeRuns(Date.now(), limit);
            await store.purgeOrphans(Date.now(), limit);
            await store.recoverPublications(limit);
            for (const record of await installationStore.pending(limit)) {
                try {
                    const installations = new WorkflowInstallations(services);
                    if (record.pendingPublication !== null) {
                        await installations.finishPublication(record);
                    } else {
                        await installations.finishRemoval(record);
                    }
                } catch (error) {
                    stores.logger.warn("workflows.installation.recovery.failed", { installationId: record.id }, error);
                }
            }
            const pending = await store.pendingTriggers(limit, triggerCursor);
            triggerCursor = pending.length === limit ? pending.at(-1)!.id : undefined;
            for (const trigger of pending) {
                if (stopped) {
                    break;
                }
                try {
                    await triggers.settle(trigger);
                } catch (error) {
                    stores.logger.warn("workflows.trigger.recovery.failed", {
                        triggerId: trigger.id,
                        code: error instanceof WorkflowError ? error.code : "CORE_UNAVAILABLE",
                    });
                }
            }
            const healthPage = await store.triggers(healthCursor, Math.min(limit, 5));
            healthCursor = healthPage.nextCursor;
            for (const trigger of healthPage.items) {
                if (stopped) {
                    break;
                }
                if (trigger.state === "active") {
                    try {
                        await triggers.revalidate(trigger.id, trigger.revision);
                    } catch (error) {
                        stores.logger.warn("workflows.validation.deferred", { triggerId: trigger.id }, error);
                    }
                }
            }
            let count = 0;
            while (!stopped && count < limit && (await runner.runOne())) {
                count++;
            }
            return count;
        },
    };
}
