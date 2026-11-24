import { expect, test } from "bun:test";
import { contentMongo } from "../../../../../tests/integration/content/mongo";
import { fixture } from "../support/fixture";
import { EventsError } from "@bernouy/cms-events";
const integration = process.env.ULVIA_RUN_EVENTS_MONGO === "1" ? test : test.skip;
integration(
    "origin identity participates in durable deduplication while randomized proofs do not",
    async () => {
        const mongo = await contentMongo();
        try {
            const f = await fixture(mongo.client.db(`origin_${crypto.randomUUID().replaceAll("-", "")}`));
            const source = await f.definitions.resolve(f.producer, "payment.succeeded");
            Object.assign(f.services, {
                initiators: {
                    verify: async (_owner: unknown, _definition: unknown, _id: unknown, proof: string) => {
                        if (proof === "forged") {
                            throw new EventsError("FORBIDDEN");
                        }
                        return {
                            initiator: { kind: "user", reference: proof },
                            fingerprint: proof.startsWith("same-") ? "same-user" : "other-user",
                        };
                    },
                },
            });
            await f.subscriptions.create(f.receiver, "sub", {
                definitionId: source.id,
                definitionDigest: source.digest,
                enabled: true,
                delivery: { contractId: "test/automation", capabilityId: "events.receive" },
            });
            const publish = (proof?: string) =>
                f.publications.publish(f.producer, source.id, "one", '{"id":"order","secret":"private"}', [], proof);
            await expect(publish("forged")).rejects.toHaveProperty("code", "FORBIDDEN");
            expect(await f.db.collection("event_publications").countDocuments()).toBe(0);
            const receipt = await publish("same-first");
            expect(await publish("same-recaptured")).toEqual(receipt);
            await expect(publish("changed-user")).rejects.toHaveProperty("code", "PUBLICATION_CONFLICT");
            await expect(publish()).rejects.toHaveProperty("code", "PUBLICATION_CONFLICT");
            expect(await f.db.collection("event_publications").countDocuments()).toBe(1);
            let delivered = false;
            await f
                .worker(async (event) => {
                    expect(event.initiator).toEqual({ kind: "user", reference: "same-first" });
                    expect(event.payloadJson).toBe('{"id":"order"}');
                    delivered = true;
                    return { deliveryId: event.deliveryId, accepted: true };
                })
                .runOne();
            expect(delivered).toBe(true);
        } finally {
            await mongo.close();
        }
    },
    30000,
);
