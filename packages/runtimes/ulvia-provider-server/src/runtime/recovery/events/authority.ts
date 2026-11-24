import { originParent } from "./origins/parent";
import { SchemaResolutionError } from "@bernouy/ulvia-contracts/resolution";
import { eventSourceReader } from "./reader";
import { resolveContract } from "@bernouy/ulvia-contracts";
import { EventsError, eventDefinitionDigest } from "@bernouy/cms-events";
import type { EventServices, EventsAuthority } from "@bernouy/cms-events";
import { assertEventMessageReceiver } from "@bernouy/cms-gateway/events";
import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type { createProviderGateway } from "../../gateway/createProviderGateway";
import type { ProviderStores } from "../../stores/providerStores";
import { capabilityGranted } from "@bernouy/ulvia-providers/selections";
export function eventsAuthority(options: {
    gateway: Awaited<ReturnType<typeof createProviderGateway>>;
    stores: ProviderStores;
    instanceId: string;
    providerId: string;
    administrator: (context: ProviderCapabilityInvocationContext) => Promise<string>;
    services: () => EventServices;
}): EventsAuthority {
    const { gateway, stores, instanceId, providerId } = options;
    const provider = (context: ProviderCapabilityInvocationContext) => {
        if (
            context.siteId !== gateway.siteId ||
            context.providerId !== providerId ||
            context.invocation?.instanceId !== instanceId ||
            !context.sourceInstallationId ||
            context.subjectId ||
            context.rootRequestId ||
            context.systemServiceId ||
            context.controlAuthority
        ) {
            throw new EventsError("FORBIDDEN");
        }
        return context.sourceInstallationId;
    };
    const route = async (namespace: string, installationId?: string) => {
        const selected = await gateway.routes.resolve(gateway.siteId, namespace);
        if (
            !selected ||
            (installationId && selected.selection.installationId !== installationId) ||
            !(await gateway.routes.isCurrent(selected))
        ) {
            throw new EventsError("FORBIDDEN");
        }
        return selected;
    };
    const reader = eventSourceReader({
        siteId: gateway.siteId,
        provider,
        administrator: options.administrator,
        installation: async (namespace, installationId) =>
            (await route(namespace, installationId)).selection.installationId,
    });
    const resourceQuery = async (
        definition: Parameters<EventsAuthority["assertSource"]>[0],
        capabilityId: string,
        input: unknown,
    ) => {
        const selected = await route(definition.owner.namespace, definition.owner.installationId);
        const resolved = await resolveContract(stores.releases, selected.requestedRelease.admission);
        const event = resolved.events.find(({ definition: entry }) => entry.id === definition.eventType);
        if (!event || eventDefinitionDigest(event.definition) !== definition.digest) {
            throw new EventsError("DEFINITION_CONFLICT");
        }
        const resolverOwner = resolved.capabilities.find(({ definition: entry }) => entry.id === capabilityId)?.owner;
        if (!resolverOwner) {
            throw new EventsError("INVALID_INPUT");
        }
        const result = await gateway.invoker.invoke({
            siteId: gateway.siteId,
            contractId: resolverOwner.contractId,
            capabilityId,
            input,
            actor: { kind: "system", serviceId: "cms-events-schema" },
            expectedTarget: {
                installationId: definition.owner.installationId,
                endpoint: selected.installation.installation.endpoint,
                accountId: selected.installation.installation.accountId,
                instanceId: selected.installation.observation!.report.instanceId,
                version: resolverOwner.version,
                digest: resolverOwner.digest,
            },
        });
        if (result.kind === "declared-error" && result.errorCode === "SCHEMA_VERSION_CONFLICT") {
            throw new SchemaResolutionError("SCHEMA_VERSION_CONFLICT");
        }
        if (result.kind === "declared-error" && result.errorCode === "NOT_FOUND") {
            throw new EventsError("NOT_FOUND");
        }
        if (result.kind !== "success") {
            throw new EventsError("CORE_UNAVAILABLE");
        }
        return result.output;
    };
    const authority: EventsAuthority = {
        reader,
        async source(context, namespace) {
            await reader(context);
            const selected = await route(namespace);
            return { siteId: gateway.siteId, installationId: selected.selection.installationId, namespace };
        },
        async owner(context, namespace) {
            if (
                context.siteId !== gateway.siteId ||
                context.providerId !== providerId ||
                context.invocation?.instanceId !== instanceId ||
                !context.sourceInstallationId ||
                context.systemServiceId ||
                context.controlAuthority ||
                (context.subjectId && !context.rootRequestId)
            ) {
                throw new EventsError("FORBIDDEN");
            }
            const installationId = context.sourceInstallationId;
            await route(namespace, installationId);
            return { siteId: gateway.siteId, installationId, namespace };
        },
        async subscriber(context, consumerContractId) {
            const installationId = provider(context);
            await route(consumerContractId, installationId);
            return { siteId: gateway.siteId, installationId, consumerContractId };
        },
        async contract(owner) {
            if (owner.siteId !== gateway.siteId) {
                throw new EventsError("FORBIDDEN");
            }
            const selected = await route(owner.namespace, owner.installationId);
            return resolveContract(stores.releases, selected.requestedRelease.admission);
        },
        async assertSource(definition) {
            const resolved = await authority.contract(definition.owner);
            if (
                !resolved.events.some(
                    ({ definition: event, owner }) =>
                        event.id === definition.eventType &&
                        owner.contractId === definition.owner.namespace &&
                        eventDefinitionDigest(event) === definition.digest,
                )
            ) {
                throw new EventsError("DEFINITION_CONFLICT");
            }
        },
        async schema(definition, resolverId, input) {
            return resourceQuery(definition, resolverId, input);
        },
        async receiver(owner, config) {
            if (owner.siteId !== gateway.siteId || owner.consumerContractId !== config.delivery.contractId) {
                throw new EventsError("FORBIDDEN");
            }
            const selected = await route(owner.consumerContractId, owner.installationId);
            const capability = selected.requestedRelease.admission.release.capabilities.find(
                ({ id }) => id === config.delivery.capabilityId,
            );
            const grants = await stores.selections.get(gateway.siteId);
            if (
                !capability ||
                !grants ||
                !capabilityGranted(grants.grants, selected.selection.contractId, capability.id)
            ) {
                throw new EventsError("FORBIDDEN");
            }
            try {
                assertEventMessageReceiver(capability);
            } catch {
                throw new EventsError("INVALID_INPUT");
            }
            const installed = selected.installation.installation;
            const observedInstance = selected.installation.observation?.report.instanceId;
            if (!observedInstance) {
                throw new EventsError("FORBIDDEN");
            }
            return {
                installationId: installed.id,
                contractId: config.delivery.contractId,
                capabilityId: config.delivery.capabilityId,
                version: selected.requestedRelease.admission.release.version,
                digest: selected.requestedRelease.admission.digest,
                endpoint: installed.endpoint,
                accountId: installed.accountId,
                instanceId: observedInstance,
            };
        },
        async ancestry(context, causeDeliveryId) {
            if (causeDeliveryId) {
                const sourceInstallationId = provider(context);
                return (await originParent(stores.db, gateway.siteId, sourceInstallationId, causeDeliveryId)).causation;
            }
            if (!context.connectionId || context.invocation?.instanceId !== instanceId) {
                throw new EventsError("FORBIDDEN");
            }
            return context.eventCausation ?? [];
        },
    };
    return authority;
}
