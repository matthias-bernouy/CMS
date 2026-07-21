import { describe, expect, test } from "bun:test";
import {
    InMemoryTriggerRepository,
    matchingTriggers,
    readJsonBodyUnderLimit,
    triggerReadsRequestBody,
    triggerReadsResponseBody,
    type TriggerRecord,
} from "@bernouy/cms-triggers";
import { endpoint, trigger } from "./helpers/triggerFixtures";

describe("cms-triggers matching", () => {
    test("matches enabled endpoint triggers with independent source and endpoint wildcards", () => {
        const records: TriggerRecord[] = [
            trigger({
                id: "exact",
                event: { kind: "endpoint", source: "orders", endpoint: "createOrder", phase: "response" },
            }),
            trigger({ id: "source", event: { kind: "endpoint", source: "orders", phase: "response" } }),
            trigger({ id: "endpoint", event: { kind: "endpoint", endpoint: "createOrder", phase: "response" } }),
            trigger({ id: "wildcard", event: { kind: "endpoint", phase: "response" } }),
            trigger({
                id: "phase",
                event: { kind: "endpoint", source: "orders", endpoint: "createOrder", phase: "request" },
            }),
            trigger({
                id: "disabled",
                enabled: false,
                event: { kind: "endpoint", source: "orders", endpoint: "createOrder", phase: "response" },
            }),
            trigger({ id: "other", event: { kind: "endpoint", source: "customers", phase: "response" } }),
        ];

        expect(matchingTriggers(records, endpoint, "response").map((item) => item.id)).toEqual([
            "exact",
            "source",
            "endpoint",
            "wildcard",
        ]);
    });

    test("repository queries return both endpoint phases in one bounded snapshot", async () => {
        const repository = new InMemoryTriggerRepository();
        for (const record of [
            trigger({
                id: "request",
                event: { kind: "endpoint", source: "orders", endpoint: "createOrder", phase: "request" },
            }),
            trigger({ id: "response", event: { kind: "endpoint", endpoint: "createOrder", phase: "response" } }),
            trigger({ id: "other", event: { kind: "endpoint", source: "customers", phase: "response" } }),
            trigger({ id: "disabled", enabled: false }),
        ]) {
            await repository.createTrigger(record);
        }
        await Promise.all(
            Array.from({ length: 2_000 }, (_, index) =>
                repository.createTrigger(
                    trigger({
                        id: `unrelated-${index}`,
                        event: { kind: "endpoint", source: "customers", endpoint: `read-${index}`, phase: "response" },
                    }),
                ),
            ),
        );

        expect((await repository.findEndpointTriggers("orders", "createOrder")).map((item) => item.id)).toEqual([
            "request",
            "response",
        ]);
    });

    test("detects body refs and only parses JSON bodies within the cap", async () => {
        const withRefs = trigger({
            id: "refs",
            condition: { exists: "$response.body.id" },
            function: { id: "fn", body: { email: "$request.body.email" } },
        });
        expect(triggerReadsRequestBody(withRefs)).toBe(true);
        expect(triggerReadsResponseBody(withRefs)).toBe(true);
        await expect(readJsonBodyUnderLimit(Response.json({ id: 1 }), 20)).resolves.toEqual({ id: 1 });
        await expect(
            readJsonBodyUnderLimit(new Response("plain", { headers: { "content-type": "text/plain" } }), 20),
        ).resolves.toBeUndefined();
        await expect(readJsonBodyUnderLimit(Response.json({ id: "too-large" }), 4)).resolves.toBeUndefined();
    });
});
