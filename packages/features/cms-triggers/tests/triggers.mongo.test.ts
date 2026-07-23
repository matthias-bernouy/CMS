import { describe, expect, test } from "bun:test";
import type { Db } from "mongodb";
import { MongoTriggerRepository } from "@bernouy/cms-triggers/mongo";

describe("MongoTriggerRepository endpoint queries", () => {
    test("uses the endpoint index for one request and response query", async () => {
        const calls: Array<{ filter: unknown; options: unknown }> = [];
        const createdIndexes: unknown[] = [];
        const collection = {
            createIndex: async (index: unknown) => {
                createdIndexes.push(index);
            },
            find: (filter: unknown, options: unknown) => {
                calls.push({ filter, options });
                return {
                    toArray: async () => [
                        {
                            _id: "global",
                            enabled: true,
                            event: { kind: "endpoint", phase: "response" },
                            function: { id: "notify" },
                        },
                    ],
                };
            },
        };
        const db = { collection: () => collection } as unknown as Db;
        const repository = new MongoTriggerRepository(db);

        await repository.init();
        const records = await repository.findEndpointTriggers("orders", "createOrder");

        const index = { "event.source": 1, "event.endpoint": 1, "event.phase": 1, enabled: 1 };
        expect(createdIndexes).toEqual([
            index,
            {
                "event.kind": 1,
                enabled: 1,
                "scheduleState.nextRunAt": 1,
                "scheduleState.running.expiresAt": 1,
            },
        ]);
        expect(calls).toEqual([
            {
                filter: {
                    enabled: true,
                    "event.kind": "endpoint",
                    "event.phase": { $in: ["request", "response"] },
                    $or: [
                        { "event.source": "orders", "event.endpoint": "createOrder" },
                        { "event.source": "orders", "event.endpoint": { $exists: false } },
                        { "event.source": { $exists: false }, "event.endpoint": "createOrder" },
                        { "event.source": { $exists: false }, "event.endpoint": { $exists: false } },
                    ],
                },
                options: { hint: index },
            },
        ]);
        expect(records.map((record) => record.id)).toEqual(["global"]);
    });
});
