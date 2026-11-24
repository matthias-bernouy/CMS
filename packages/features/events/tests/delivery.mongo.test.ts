import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { MongoEventsStore } from "@bernouy/cms-events/mongo";
import { contentMongo } from "../../../../tests/integration/content/mongo";
import { fixture } from "./support/fixture";
const enabled = process.env.ULVIA_RUN_EVENTS_MONGO === "1";
describe.skipIf(!enabled)("Delivery window and metadata-only diagnostics", () => {
    let mongo: Awaited<ReturnType<typeof contentMongo>>;
    beforeAll(async () => {
        mongo = await contentMongo();
    }, 30000);
    afterAll(async () => {
        await mongo?.close();
    }, 30000);
    test("backoff spans 24 hours, caps at one hour, and keeps diagnostics without expired payloads", async () => {
        const f = await fixture(mongo.client.db(`event_window_${crypto.randomUUID().replaceAll("-", "")}`));
        Object.assign(f.services.policy, { retryMs: 5000, maxRetryMs: 3600000, maxAttempts: null });
        const source = await f.definitions.resolve(f.producer, "order.paid");
        const configuration = {
            definitionId: source.id,
            definitionDigest: source.digest,
            enabled: true,
            delivery: { contractId: "test/automation", capabilityId: "events.receive" },
        };
        for (let index = 0; index < 3; index++) {
            await f.subscriptions.create(f.receiver, `receiver-${index}`, configuration);
        }
        const receipt = await f.publications.publish(
            f.producer,
            source.id,
            "event",
            '{"id":"order","secret":"private"}',
        );
        const worker = f.worker(async () => {
            throw new Error("Provider offline");
        });
        const start = f.services.now();
        let retries = 0;
        while (f.services.now() < start + 86400000) {
            while (await worker.runOne()) {
                retries++;
            }
            const page = await f.store.deliveryStatuses(f.receiver, undefined, 100, f.services.now());
            expect(page.items.every((item) => item.state === "pending")).toBe(true);
            const due = Math.min(...page.items.map((item) => item.nextAttemptAt!));
            expect(due - f.services.now()).toBeLessThanOrEqual(3600000);
            if (retries === 3) {
                expect(due - f.services.now()).toBe(5000);
            }
            if (retries === 6) {
                expect(due - f.services.now()).toBe(10000);
            }
            f.advance(due - f.services.now());
        }
        expect(retries).toBeGreaterThan(36);
        while (await worker.runOne()) {
            retries++;
        }
        const first = await f.store.deliveryStatuses(f.receiver, undefined, 2, f.services.now());
        const second = await f.store.deliveryStatuses(f.receiver, first.nextCursor, 2, f.services.now());
        expect(first.items).toHaveLength(2);
        expect(second.items).toHaveLength(1);
        expect(new Set([...first.items, ...second.items].map((item) => item.deliveryId)).size).toBe(3);
        expect(
            [...first.items, ...second.items].every(
                (item) => item.state === "failed" && item.failureCode === "DELIVERY_EXPIRED",
            ),
        ).toBe(true);
        expect(JSON.stringify(first)).not.toMatch(/payload|private|selector|target|fingerprint/u);
        expect(
            (
                await f.store.deliveryStatuses(
                    { ...f.receiver, installationId: "foreign" },
                    undefined,
                    100,
                    f.services.now(),
                )
            ).items,
        ).toEqual([]);
        await expect(
            f.store.deliveryStatuses(
                { ...f.receiver, consumerContractId: "test/other" },
                first.nextCursor,
                2,
                f.services.now(),
            ),
        ).rejects.toHaveProperty("code", "INVALID_INPUT");
        await expect(
            new MongoEventsStore(f.db, "foreign").deliveryStatuses(f.receiver, undefined, 2, f.services.now()),
        ).rejects.toHaveProperty("code", "FORBIDDEN");
        expect(await f.db.collection("domain_event_outbox_payloads").countDocuments()).toBe(0);
        const record = await f.db.collection("domain_event_outbox").findOne({});
        expect(record!.expiresAt.getTime()).toBe(start + 2592000000);
        const publication = await f.db.collection("event_publications").findOne({});
        expect(publication!.expiresAt.getTime()).toBe(start + 2592000000);
        expect(
            (await f.publications.publish(f.producer, source.id, "event", '{"id":"order","secret":"private"}'))
                .occurrenceId,
        ).toBe(receipt.occurrenceId);
    });
    test("receipt expiration creates a new occurrence even when old outbox metadata has not been removed yet", async () => {
        const f = await fixture(mongo.client.db(`event_expiry_${crypto.randomUUID().replaceAll("-", "")}`));
        const source = await f.definitions.resolve(f.producer, "order.paid");
        await f.subscriptions.create(f.receiver, "subscriber", {
            definitionId: source.id,
            definitionDigest: source.digest,
            enabled: true,
            delivery: { contractId: "test/automation", capabilityId: "events.receive" },
        });
        const payload = '{"id":"order","secret":"private"}';
        const first = await f.publications.publish(f.producer, source.id, "reusable-after-expiry", payload);
        const delivered: string[] = [];
        const worker = f.worker(async (event) => {
            delivered.push(event.occurrenceId);
            return { deliveryId: event.deliveryId, accepted: true };
        });
        expect(await worker.runOne()).toBe(true);
        f.advance(2592000001);
        // Mongo TTL visits collections independently; the receipt may disappear before its old delivery metadata.
        await f.db.collection("event_publications").deleteMany({});
        const second = await f.publications.publish(f.producer, source.id, "reusable-after-expiry", payload);
        expect(second.occurrenceId).not.toBe(first.occurrenceId);
        expect(await f.publications.publish(f.producer, source.id, "reusable-after-expiry", payload)).toEqual(second);
        expect(await worker.runOne()).toBe(true);
        expect(delivered).toEqual([first.occurrenceId, second.occurrenceId]);
        expect(await f.db.collection("domain_event_outbox").countDocuments()).toBe(2);
    });
});
