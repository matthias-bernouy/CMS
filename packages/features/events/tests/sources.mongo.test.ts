import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { admitContractRelease, resolveContract } from "@bernouy/ulvia-contracts";
import { eventDefinitionDigest } from "@bernouy/cms-events";
import { contentMongo } from "../../../../tests/integration/content/mongo";
import { fixture } from "./support/fixture";
const enabled = process.env.ULVIA_RUN_EVENTS_MONGO === "1";
describe.skipIf(!enabled)("Event declaration identity across contract releases", () => {
    let mongo: Awaited<ReturnType<typeof contentMongo>>;
    beforeAll(async () => {
        mongo = await contentMongo();
    }, 30000);
    afterAll(async () => {
        await mongo?.close();
    }, 30000);
    test("unchanged declarations preserve existing subscriptions while changed declarations get distinct fingerprints", async () => {
        const f = await fixture(mongo.client.db(`event_sources_${crypto.randomUUID().replaceAll("-", "")}`));
        const before = await f.definitions.resolve(f.producer, "order.paid");
        await f.subscriptions.create(f.receiver, "existing", {
            definitionId: before.id,
            definitionDigest: before.digest,
            enabled: true,
            delivery: { contractId: "test/automation", capabilityId: "events.receive" },
        });
        const original = await f.services.authority.contract(f.producer);
        let current = original;
        f.services.authority.contract = async () => current;
        f.services.authority.assertSource = async (source) => {
            const declaration = current.events.find(({ definition }) => definition.id === source.eventType);
            if (!declaration || eventDefinitionDigest(declaration.definition) !== source.digest) {
                throw new Error("Stale declaration");
            }
        };
        const admitted = await admitContractRelease({
            ...original.release,
            version: "1.1.0",
            description: "Unrelated contract update",
            events: original.release.events!.map((event) => ({
                ...event,
                description: "Updated display documentation",
            })),
        });
        current = await resolveContract({ get: async () => null }, admitted);
        const after = await f.definitions.resolve(f.producer, "order.paid");
        expect(after.id).toBe(before.id);
        expect(after.digest).toBe(before.digest);
        expect(current.digest).not.toBe(original.digest);
        await f.publications.publish(f.producer, after.id, "new-release-event", '{"id":"order","secret":"hidden"}');
        const sent = await f.db.collection("domain_event_outbox").findOne({});
        expect(sent!.record.deliveries[0].subscription.id).toBe("existing");
        const changed = await admitContractRelease({
            ...original.release,
            version: "2.0.0",
            events: original.release.events!.map((event) =>
                event.id === "order.paid" ? { ...event, schema: { type: "boolean" } } : event,
            ),
        });
        current = await resolveContract({ get: async () => null }, changed);
        const incompatible = await f.definitions.resolve(f.producer, "order.paid");
        expect(incompatible.id).not.toBe(before.id);
        expect(incompatible.digest).not.toBe(before.digest);
        await expect(
            f.publications.publish(f.producer, before.id, "stale", '{"id":"order","secret":"hidden"}'),
        ).rejects.toThrow("Stale declaration");
        expect(await f.db.collection("event_publications").countDocuments()).toBe(1);
    });
});
