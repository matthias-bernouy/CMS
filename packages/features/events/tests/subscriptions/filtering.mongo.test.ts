import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { contentMongo } from "../../../../../tests/integration/content/mongo";
import { fixture } from "../support/fixture";
const enabled = process.env.ULVIA_RUN_EVENTS_MONGO === "1";
describe.skipIf(!enabled)("Indexed event filters", () => {
    let mongo: Awaited<ReturnType<typeof contentMongo>>;
    beforeAll(async () => {
        mongo = await contentMongo();
    }, 30000);
    afterAll(async () => {
        await mongo?.close();
    }, 30000);
    test("wildcards and declared subsets route independently of schema resolution and an update can remove its filter", async () => {
        const f = await fixture(
            mongo.client.db(`event_filter_${crypto.randomUUID().replaceAll("-", "")}`),
            {},
            { "order.paid": ["id"] },
        );
        const source = await f.definitions.resolve(f.producer, "order.paid");
        const config = {
            definitionId: source.id,
            definitionDigest: source.digest,
            enabled: true,
            delivery: { contractId: f.receiver.consumerContractId, capabilityId: "events.receive" },
        };
        for (const [id, filter] of [
            ["all", undefined],
            ["match", '{"id":"one"}'],
            ["other", '{"id":"two"}'],
        ] as const) {
            await f.subscriptions.create(f.receiver, id, { ...config, ...(filter ? { filterJson: filter } : {}) });
        }
        const before = await f.db.collection("event_subscriptions").countDocuments();
        for (const filterJson of ['{"secret":"private"}', '{"id":3}', '{"unknown":true}']) {
            await expect(
                f.subscriptions.create(f.receiver, "invalid", { ...config, filterJson }),
            ).rejects.toHaveProperty("code", "INVALID_INPUT");
        }
        expect(await f.db.collection("event_subscriptions").countDocuments()).toBe(before);
        await f.publications.publish(f.producer, source.id, "first", '{"id":"one","secret":"hidden"}');
        const recipients: string[] = [];
        const worker = f.worker(async (event) => {
            recipients.push(event.subscriptionId);
            return { deliveryId: event.deliveryId, accepted: true };
        });
        while (await worker.runOne()) {}
        expect(recipients.sort()).toEqual(["all", "match"]);
        const changed = await f.subscriptions.update(f.receiver, "other", 1, config);
        expect(changed.filterJson).toBeUndefined();
        await f.publications.publish(f.producer, source.id, "second", '{"id":"one","secret":"hidden"}');
        recipients.length = 0;
        while (await worker.runOne()) {}
        expect(recipients.sort()).toEqual(["all", "match", "other"]);
    });
});
