import { eventInitiators } from "./origins";
import { eventSourceInventory } from "./sources";
import { createHmac } from "node:crypto";
import { EventDefinitions, EventPublications, EventSubscriptions, EventsError, eventHash } from "@bernouy/cms-events";
import type { EventServices, EventSubscription } from "@bernouy/cms-events";
import { MongoEventsStore } from "@bernouy/cms-events/mongo";
import { DurableDeliveryWorker, validateEventReceipt } from "@bernouy/cms-gateway/events";
import type { EventMessageContent, EventMessage } from "@bernouy/cms-gateway/events";
import { MongoEventOutbox } from "@bernouy/cms-gateway/events/mongo";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { withSiteWriteFence } from "@bernouy/repository/upgrades";
import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type { createProviderGateway } from "../../gateway/createProviderGateway";
import type { ProviderStores } from "../../stores/providerStores";
import { eventsAuthority } from "./authority";
export async function composeEvents(options: {
    stores: ProviderStores;
    gateway: Awaited<ReturnType<typeof createProviderGateway>>;
    instanceId: string;
    providerId: string;
    administrator: (context: ProviderCapabilityInvocationContext) => Promise<string>;
}) {
    const { stores, gateway } = options;
    const raw = new MongoEventsStore(stores.db, gateway.siteId);
    await raw.init();
    const outbox = await new MongoEventOutbox<EventMessageContent, EventSubscription>(
        stores.db,
        "domain_event_outbox",
        eventHash,
        ({ payloadJson: _payload, ...metadata }) => metadata,
    ).init();
    const policy = {
        leaseMs: 30000,
        retryMs: 5000,
        maxAttempts: null,
        maxRetryMs: 3600000,
        receiptRetentionMs: 2592000000,
        retentionMs: 86400000,
        maxFanout: 64,
    };
    const services: EventServices = {
        store: raw,
        outbox,
        policy,
        now: Date.now,
        fingerprint: (value) =>
            createHmac("sha256", stores.runtimeSessionSecret)
                .update("ulvia-event-publication/v1\0")
                .update(canonicalizeIJson(value))
                .digest("hex"),
        authority: eventsAuthority({ ...options, services: () => services }),
        initiators: eventInitiators({ ...options, services: () => services }),
    };
    const mutations = [
        "putDefinition",
        "sealResource",
        "putPublication",
        "createSubscription",
        "replaceSubscription",
        "cancelSubscription",
        "stagePublicationBatch",
        "advancePublication",
    ];
    const guarded = new Proxy(raw, {
        get(target, property) {
            if (property === "putDefinition") {
                return async (record: Parameters<typeof raw.putDefinition>[0]) => {
                    await services.authority.assertSource(record);
                    return raw.putDefinition(record);
                };
            }
            if (property === "createSubscription" || property === "replaceSubscription") {
                return async (record: EventSubscription, revision?: number) => {
                    if (record.enabled && !record.deleted) {
                        const definition = await new EventDefinitions(services).get(record.definitionId);
                        if (definition.digest !== record.definitionDigest) {
                            throw new EventsError("DEFINITION_CONFLICT");
                        }
                        await services.authority.assertSource(definition);
                        if (
                            canonicalizeIJson(await services.authority.receiver(record.owner, record)) !==
                            canonicalizeIJson(record.target)
                        ) {
                            throw new EventsError("REVISION_CONFLICT");
                        }
                    }
                    return property === "createSubscription"
                        ? raw.createSubscription(record)
                        : raw.replaceSubscription(record, revision!);
                };
            }
            if (property === "putPublication") {
                return async (record: Parameters<typeof raw.putPublication>[0]) => {
                    const definition = await new EventDefinitions(services).get(record.definitionId, null, true);
                    await services.authority.assertSource(definition);
                    if (definition.retired && !(await raw.publication(record.id))) {
                        throw new EventsError("DEFINITION_RETIRED");
                    }
                    return raw.putPublication(record);
                };
            }
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
    Object.assign(services, {
        store: withSiteWriteFence(guarded, stores.upgradeStorage, gateway.siteId, mutations, mutations),
    });
    const abort = new AbortController();
    const worker = new DurableDeliveryWorker<EventMessageContent, EventSubscription, EventMessage>({
        siteId: gateway.siteId,
        events: outbox,
        policy,
        now: Date.now,
        active: async (subscription) => {
            const current = await raw.subscription(subscription.owner, subscription.id);
            return Boolean(current && !current.deleted && current.enabled);
        },
        authorize: async (subscription) => {
            const definition = await new EventDefinitions(services).get(subscription.definitionId, null, true);
            await services.authority.assertSource(definition);
            const current = await services.authority.receiver(subscription.owner, subscription);
            return (
                definition.digest === subscription.definitionDigest &&
                canonicalizeIJson(current) === canonicalizeIJson(subscription.target)
            );
        },
        envelope: (record, intent) => ({
            ...record.event,
            deliveryId: intent.id,
            subscriptionId: intent.subscription.id,
            subscriptionRevision: intent.subscription.revision,
            consumerContractId: intent.subscription.owner.consumerContractId,
        }),
        validateReceipt: validateEventReceipt,
        send: async (subscription, event, signal) => {
            const result = await gateway.invoker.invoke({
                siteId: gateway.siteId,
                contractId: subscription.delivery.contractId,
                capabilityId: subscription.delivery.capabilityId,
                input: event,
                expectedTarget: {
                    installationId: subscription.target.installationId,
                    endpoint: subscription.target.endpoint,
                    accountId: subscription.target.accountId,
                    instanceId: subscription.target.instanceId,
                    version: subscription.target.version,
                    digest: subscription.target.digest,
                },
                signal: AbortSignal.any([signal, abort.signal]),
                actor: { kind: "system", serviceId: "cms-events-delivery" },
            });
            if (result.kind !== "success") {
                throw new EventsError("CORE_UNAVAILABLE");
            }
            return result.output;
        },
        onFailure: (metadata) => stores.logger.warn("events.delivery.failed", metadata),
    });
    const publications = new EventPublications(services);
    const refreshSources = eventSourceInventory(stores, gateway, services);
    return {
        services,
        definitions: new EventDefinitions(services),
        subscriptions: new EventSubscriptions(services),
        publications,
        async recover(limit: number) {
            await refreshSources(limit);
            await publications.recover(limit);
            let count = 0;
            while (!abort.signal.aborted && count < limit && (await worker.runOne())) {
                count++;
            }
            return count;
        },
        async stop() {
            abort.abort();
        },
    };
}
