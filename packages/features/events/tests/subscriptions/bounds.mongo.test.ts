import { eventHash } from "@bernouy/cms-events";
import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { contentMongo } from "../../../../../tests/integration/content/mongo";
import { MongoEventsStore } from "@bernouy/cms-events/mongo";
import { fixture } from "../support/fixture";
const enabled = process.env.ULVIA_RUN_EVENTS_MONGO === "1";
describe.skipIf(!enabled)("Domain publication handoff capacity", () => {
    let mongo: Awaited<ReturnType<typeof contentMongo>>;
    beforeAll(async () => {
        mongo = await contentMongo();
    }, 30000);
    afterAll(async () => {
        await mongo?.close();
    }, 30000);
    test("escaped payload capacity is refused before a receipt that cannot fit its durable outbox is committed", async () => {
        const db = mongo.client.db(`event_bounds_${crypto.randomUUID().replaceAll("-", "")}`);
        const f = await fixture(db, { large: { type: "string", maxLength: 600000 }, fanout: { type: "boolean" } });
        const definition = await f.definitions.resolve(f.producer, "large");
        await f.subscriptions.create(f.receiver, "receiver", {
            definitionId: definition.id,
            definitionDigest: definition.digest,
            enabled: true,
            delivery: { contractId: "test/automation", capabilityId: "events.receive" },
        });
        const payload = JSON.stringify('"'.repeat(524270));
        expect(Buffer.byteLength(payload)).toBeLessThan(1048576);
        await expect(f.publications.publish(f.producer, definition.id, "oversized", payload)).rejects.toHaveProperty(
            "code",
            "CAPACITY_EXCEEDED",
        );
        expect(await db.collection("event_publications").countDocuments()).toBe(0);
        expect(await db.collection("domain_event_outbox").countDocuments()).toBe(0);
        expect((await f.publications.publish(f.producer, definition.id, "oversized", '"safe"')).accepted).toBe(true);
        expect(await db.collection("event_publications").countDocuments()).toBe(1);
    });
    test("65 frozen recipients resume in bounded batches despite subscription changes and a lost handoff receipt", async () => {
        const db = mongo.client.db(`event_fanout_${crypto.randomUUID().replaceAll("-", "")}`);
        const f = await fixture(db, { fanout: { type: "boolean" } });
        const definition = await f.definitions.resolve(f.producer, "fanout");
        const configuration = {
            definitionId: definition.id,
            definitionDigest: definition.digest,
            enabled: true,
            delivery: { contractId: "test/automation", capabilityId: "events.receive" },
        };
        for (let count = 0; count < 65; count++) {
            await f.subscriptions.create(f.receiver, `sub-${count}`, configuration);
        }
        const original = f.outbox.publish.bind(f.outbox);
        let lose = true;
        f.outbox.publish = async (record) => {
            await original(record);
            if (lose) {
                lose = false;
                throw new Error("Lost handoff response");
            }
        };
        await expect(f.publications.publish(f.producer, definition.id, "fanout", "true")).rejects.toThrow();
        expect(await db.collection("event_publications").countDocuments()).toBe(1);
        const first = await db.collection("domain_event_outbox").findOne({});
        expect(first!.record.deliveries).toHaveLength(64);
        const pending = (await f.store.pendingPublications(1))[0]!;
        const page = await f.store.matchingSubscriptions(definition.id, 64, [eventHash({})], pending.fanout!.snapshot);
        const last = await f.store.matchingSubscriptions(
            definition.id,
            64,
            [eventHash({})],
            pending.fanout!.snapshot,
            page.nextCursor,
        );
        const previous = last.items[0]!;
        await f.subscriptions.update(f.receiver, previous.id, previous.revision, { ...configuration, enabled: false });
        await f.subscriptions.create(f.receiver, "late", configuration);
        await f.publications.recover(1);
        await f.publications.recover(1);
        expect((await f.store.publication(pending.id))!.pending).toBe(false);
        const rows = await db.collection("domain_event_outbox").find().toArray();
        expect(rows).toHaveLength(2);
        const intents = rows.flatMap((row) => row.record.deliveries);
        expect(intents).toHaveLength(65);
        expect(new Set(intents.map((intent) => intent.id)).size).toBe(65);
        expect(intents.some((intent) => intent.subscription.id === "late")).toBe(false);
        expect(intents.find((intent) => intent.subscription.id === previous.id).subscription.revision).toBe(1);
        expect(await f.publications.publish(f.producer, definition.id, "fanout", "true")).toMatchObject({
            accepted: true,
        });
        expect(await db.collection("domain_event_outbox").countDocuments()).toBe(2);
    });
    test("an interrupted membership commit reopens atomically without changing earlier snapshots", async () => {
        const f = await fixture(mongo.client.db(`event_membership_${crypto.randomUUID().replaceAll("-", "")}`));
        const definition = await f.definitions.resolve(f.producer, "one");
        const configuration = {
            definitionId: definition.id,
            definitionDigest: definition.digest,
            enabled: true,
            delivery: { contractId: "test/automation", capabilityId: "events.receive" },
        };
        const before = await f.store.subscriptionSnapshot();
        await f.db.admin().command({
            configureFailPoint: "failCommand",
            mode: { times: 1 },
            data: { failCommands: ["insert"], errorCode: 1 },
        });
        await expect(f.subscriptions.create(f.receiver, "interrupted", configuration)).rejects.toHaveProperty(
            "code",
            1,
        );
        expect(await f.store.subscriptionSnapshot()).toBe(before);
        expect((await f.store.matchingSubscriptions(definition.id, 64, [eventHash({})], before)).items).toEqual([]);
        const reopened = await new MongoEventsStore(f.db, "site-a").init();
        expect((await reopened.subscription(f.receiver, "interrupted"))!.revision).toBe(1);
        expect(await reopened.subscriptionSnapshot()).toBe(before + 1);
        expect((await reopened.matchingSubscriptions(definition.id, 64, [eventHash({})], before)).items).toEqual([]);
        const current = await reopened.matchingSubscriptions(definition.id, 64, [eventHash({})], before + 1);
        expect(current.items.map(({ id }) => id)).toEqual(["interrupted"]);
    });
});
