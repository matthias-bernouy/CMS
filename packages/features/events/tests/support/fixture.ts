import { admitContractRelease, resolveContract } from "@bernouy/ulvia-contracts";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import { createHmac } from "node:crypto";
import type { Db } from "mongodb";
import { MongoEventsStore } from "@bernouy/cms-events/mongo";
import { EventDefinitions, EventPublications, EventSubscriptions, eventHash, EventsError } from "@bernouy/cms-events";
import type { EventServices } from "@bernouy/cms-events";
import { MongoEventOutbox } from "@bernouy/cms-gateway/events/mongo";
import { DurableDeliveryWorker, validateEventReceipt } from "@bernouy/cms-gateway/events";
import type { EventMessageContent, EventMessage } from "@bernouy/cms-gateway/events";
import type { EventSubscription } from "@bernouy/cms-events";
export async function fixture(
    db: Db,
    overrides: Record<string, UlviaSchema> = {},
    filterKeys: Record<string, readonly string[]> = {},
) {
    const admission = await admitContractRelease({
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        contractId: "test/payments",
        publisherId: "test",
        name: "Payments",
        version: "1.0.0",
        capabilities: [],
        events: ["payment.succeeded", "order.paid", "one", "two", "three", ...Object.keys(overrides)]
            .map((id) => ({
                id,
                schema: overrides[id] ?? schema,
                sensitive: false,
                ...(filterKeys[id] ? { filterKeys: filterKeys[id] } : {}),
            }))
            .filter((entry, index, rows) => rows.findIndex((other) => other.id === entry.id) === index),
    });
    const contract = await resolveContract({ get: async () => null }, admission);
    let now = Date.now();
    const store = new MongoEventsStore(db, "site-a");
    await store.init();
    const outbox = await new MongoEventOutbox<EventMessageContent, EventSubscription>(
        db,
        "domain_event_outbox",
        eventHash,
        ({ payloadJson: _payload, ...metadata }) => metadata,
    ).init();
    const producer = { siteId: "site-a", installationId: "producer", namespace: "test/payments" };
    const receiver = { siteId: "site-a", installationId: "receiver", consumerContractId: "test/automation" };
    const services: EventServices = {
        store,
        outbox,
        now: () => now,
        fingerprint: (value) => createHmac("sha256", "test-instance-key").update(JSON.stringify(value)).digest("hex"),
        policy: {
            leaseMs: 30000,
            retryMs: 5,
            maxAttempts: 3,
            receiptRetentionMs: 2592000000,
            retentionMs: 86400000,
            maxFanout: 64,
        },
        authority: {
            source: async () => producer,
            contract: async () => contract,
            schema: async () => {
                throw new EventsError("INVALID_INPUT");
            },
            owner: async () => producer,
            reader: async () => producer,
            subscriber: async () => receiver,
            assertSource: async (definition) => {
                if (definition.owner.siteId !== "site-a") {
                    throw new EventsError("FORBIDDEN");
                }
            },
            receiver: async (owner, config) => ({
                installationId: owner.installationId,
                contractId: config.delivery.contractId,
                capabilityId: config.delivery.capabilityId,
                version: "1.0.0",
                digest: `sha256:${"b".repeat(64)}`,
                endpoint: "https://receiver.example",
                accountId: "account",
                instanceId: "instance",
            }),
            ancestry: async () => [],
        },
    };
    const worker = (send: (event: EventMessage) => Promise<unknown>) =>
        new DurableDeliveryWorker({
            siteId: "site-a",
            events: outbox,
            policy: services.policy,
            now: services.now,
            active: async (subscription: EventSubscription) => {
                const current = await store.subscription(subscription.owner, subscription.id);
                return Boolean(current && !current.deleted && current.enabled);
            },
            authorize: async () => true,
            envelope: (record, intent): EventMessage => ({
                ...record.event,
                deliveryId: intent.id,
                subscriptionId: intent.subscription.id,
                subscriptionRevision: intent.subscription.revision,
                consumerContractId: intent.subscription.owner.consumerContractId,
            }),
            validateReceipt: validateEventReceipt,
            send: async (_subscription, event, _signal) => send(event),
        });
    return {
        db,
        services,
        store,
        outbox,
        producer,
        receiver,
        worker,
        definitions: new EventDefinitions(services),
        publications: new EventPublications(services),
        subscriptions: new EventSubscriptions(services),
        advance: (ms: number) => {
            now += ms;
        },
    };
}
export const schema = {
    type: "object",
    properties: { id: { type: "string", maxLength: 64 }, secret: { type: "string", maxLength: 128, sensitive: true } },
    required: ["id", "secret"],
};
