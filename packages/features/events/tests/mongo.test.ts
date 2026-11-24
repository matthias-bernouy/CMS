import { admitContractRelease, resolveContract } from "@bernouy/ulvia-contracts";
import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { contentMongo } from "../../../../tests/integration/content/mongo";
import { MongoEventsStore } from "@bernouy/cms-events/mongo";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { fixture, schema } from "./support/fixture";
const enabled = process.env.ULVIA_RUN_EVENTS_MONGO === "1";
describe.skipIf(!enabled)("domain event standalone Mongo durability", () => {
    let mongo: Awaited<ReturnType<typeof contentMongo>>;
    beforeAll(async () => {
        mongo = await contentMongo();
    }, 30000);
    afterAll(async () => {
        await mongo?.close();
    }, 30000);
    const setup = () => fixture(mongo.client.db(`events_${crypto.randomUUID().replaceAll("-", "")}`));
    test("only declared contract events resolve and foreign ownership is refused without writes", async () => {
        const f = await setup();
        const definition = await f.definitions.resolve(f.producer, "payment.succeeded");
        expect(await f.definitions.resolve(f.producer, "payment.succeeded")).toEqual(definition);
        await expect(f.definitions.resolve(f.producer, "undeclared")).rejects.toHaveProperty("code", "NOT_FOUND");
        await expect(
            f.definitions.get(definition.id, { ...f.producer, installationId: "foreign" }),
        ).rejects.toHaveProperty("code", "NOT_FOUND");
        expect(await f.db.collection("event_definitions").countDocuments()).toBe(1);
        const foreign = new MongoEventsStore(f.db, "site-b");
        expect(await foreign.definition(definition.id)).toBeNull();
        await expect(foreign.putDefinition(definition)).rejects.toHaveProperty("code", "FORBIDDEN");
    });
    test("publication receipts survive reopening and no subscribers; raw sensitive differences still conflict", async () => {
        const f = await setup();
        const definition = await f.definitions.resolve(f.producer, "payment.succeeded");
        const payload = canonicalizeIJson({ id: "order", secret: "customer-secret" });
        const receipt = await f.publications.publish(f.producer, definition.id, "external-event", payload);
        expect(receipt.accepted).toBe(true);
        expect(await f.db.collection("domain_event_outbox").countDocuments()).toBe(0);
        expect(await f.db.collection("event_publications").countDocuments()).toBe(1);
        const stored = await f.db.collection("event_publications").findOne({});
        expect(await new MongoEventsStore(f.db, "site-a").publication(stored!.id)).toMatchObject({
            pending: false,
        });
        await expect(
            f.publications.publish(f.producer, definition.id, "invalid", '{"id":"order"}'),
        ).rejects.toHaveProperty("code", "INVALID_INPUT");
        expect(await f.db.collection("event_publications").countDocuments()).toBe(1);
        expect(await f.publications.publish(f.producer, definition.id, "external-event", payload)).toEqual(receipt);
        await expect(
            f.publications.publish(
                f.producer,
                definition.id,
                "external-event",
                canonicalizeIJson({ id: "order", secret: "changed-secret" }),
            ),
        ).rejects.toHaveProperty("code", "PUBLICATION_CONFLICT");
        expect(JSON.stringify(await f.db.collection("event_publications").find().toArray())).not.toContain(
            "customer-secret",
        );
    });
    test("concurrent publication freezes one delivery, clears payloads and retries lost receipts without duplicate business state", async () => {
        const f = await setup();
        const definition = await f.definitions.resolve(f.producer, "payment.succeeded");
        const config = {
            definitionId: definition.id,
            definitionDigest: definition.digest,
            enabled: true,
            delivery: { contractId: "test/automation", capabilityId: "events.receive" },
        };
        await f.subscriptions.create(f.receiver, "first", config);
        const receipts = await Promise.all(
            Array.from({ length: 12 }, () =>
                f.publications.publish(f.producer, definition.id, "event", '{"id":"order","secret":"customer-secret"}'),
            ),
        );
        expect(new Set(receipts.map(({ occurrenceId }) => occurrenceId)).size).toBe(1);
        expect(await f.db.collection("domain_event_outbox").countDocuments()).toBe(1);
        const row = await f.db.collection("domain_event_outbox").findOne({});
        expect(row!.record.deliveries).toHaveLength(1);
        expect(row!.record.event.payloadJson).toBeUndefined();
        expect((await f.db.collection("domain_event_outbox_payloads").findOne({}))!.value).toBe('{"id":"order"}');
        expect(JSON.stringify(row)).not.toContain("customer-secret");
        await f.subscriptions.create(f.receiver, "later", config);
        await f.publications.publish(f.producer, definition.id, "event", '{"id":"order","secret":"customer-secret"}');
        let lost = true;
        const send = async (event: { deliveryId: string }) => {
            await f.db
                .collection("receiver_inbox")
                .updateOne({ _id: event.deliveryId }, { $setOnInsert: { accepted: true } }, { upsert: true });
            if (lost) {
                lost = false;
                throw new Error("Lost response");
            }
            return { deliveryId: event.deliveryId, accepted: true };
        };
        await f.worker(send).runOne();
        f.advance(6);
        await f.worker(send).runOne();
        expect(await f.db.collection("receiver_inbox").countDocuments()).toBe(1);
        const complete = await f.db.collection("domain_event_outbox").findOne({});
        expect(complete!.record.deliveries[0].state).toBe("delivered");
        expect(complete!.record.event.payloadJson).toBeUndefined();
        expect(await f.worker(send).runOne()).toBe(false);
    });
    test("retries across selected contract releases keep one occurrence and never add new recipients", async () => {
        const f = await setup();
        const before = await f.definitions.resolve(f.producer, "payment.succeeded");
        const first = await f.publications.publish(
            f.producer,
            before.id,
            "stable-payment",
            '{"id":"order","secret":"private"}',
        );
        const original = await f.services.authority.contract(f.producer);
        const admission = await admitContractRelease({
            ...original.release,
            version: "1.1.0",
            description: "Compatible selected release",
        });
        const current = await resolveContract({ get: async () => null }, admission);
        f.services.authority.contract = async () => current;
        const after = await f.definitions.resolve(f.producer, "payment.succeeded");
        expect(after.id).toBe(before.id);
        expect(after.digest).toBe(before.digest);
        await f.subscriptions.create(f.receiver, "late", {
            definitionId: after.id,
            definitionDigest: after.digest,
            enabled: true,
            delivery: { contractId: "test/automation", capabilityId: "events.receive" },
        });
        expect(
            await f.publications.publish(f.producer, after.id, "stable-payment", '{"id":"order","secret":"private"}'),
        ).toEqual(first);
        expect(await f.db.collection("event_publications").countDocuments()).toBe(1);
        expect(await f.db.collection("domain_event_outbox").countDocuments()).toBe(0);
    });
    test("lists omit schemas and scope their cursors; cancellation reserves uncreated IDs", async () => {
        const f = await setup();
        for (const eventType of ["one", "two", "three"]) {
            await f.definitions.resolve(f.producer, eventType);
        }
        const first = await f.definitions.list(f.producer, undefined, 2);
        expect(first.items).toHaveLength(2);
        expect(first.items.every((item) => !("schema" in item))).toBe(true);
        expect((await f.definitions.list(f.producer, first.nextCursor, 2)).items).toHaveLength(1);
        await expect(
            f.definitions.list({ ...f.producer, installationId: "foreign" }, first.nextCursor, 2),
        ).rejects.toHaveProperty("code", "INVALID_INPUT");
        const definition = await f.store.definition(first.items[0]!.id);
        const config = {
            definitionId: definition!.id,
            definitionDigest: definition!.digest,
            enabled: true,
            delivery: { contractId: "test/automation", capabilityId: "events.receive" },
        };
        await f.subscriptions.cancel(f.receiver, "late");
        await expect(f.subscriptions.create(f.receiver, "late", config)).rejects.toHaveProperty(
            "code",
            "SUBSCRIPTION_CONFLICT",
        );
        expect((await f.subscriptions.list(f.receiver, undefined, 100)).items).toHaveLength(0);
    });
});
