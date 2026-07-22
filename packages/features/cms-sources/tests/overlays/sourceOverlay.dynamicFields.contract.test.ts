import { describe, expect, test } from "bun:test";
import { createSourceOverlayFetchProbe } from "../helpers/sourceOverlayFetchProbe";
import {
    dynamicFieldsResponse,
    dynamicOverlayRepository,
    enrichedTargetEndpoint,
    targetEndpoint,
} from "../helpers/sourceOverlayContractFixtures";

describe("dynamic source overlay contracts", () => {
    test("returns the exact enriched endpoint without exposing field-source secrets", async () => {
        const probe = createSourceOverlayFetchProbe(async () => Response.json(dynamicFieldsResponse));
        const repository = await dynamicOverlayRepository(probe.fetchImpl);

        const endpoint = await repository.getEndpoint(targetEndpoint.urn);

        expect(endpoint).toEqual(enrichedTargetEndpoint);
        const serialized = JSON.stringify(endpoint);
        expect(serialized).not.toContain("${ACCOUNT_FIELDS_KEY}");
        expect(serialized).not.toContain("resolved-field-source-secret");
        expect(serialized).not.toContain("payload-private-value");
        expect(serialized).not.toContain("payload-connector-secret");
        const fieldRequest = probe.observations.find((entry) => new URL(entry.url).pathname === "/fields");
        expect(fieldRequest?.headers.get("authorization")).toBe("Bearer resolved-field-source-secret");
    });

    test.each([
        ["an upstream error", async () => new Response("unavailable", { status: 503 })],
        [
            "a network failure",
            async () => {
                throw new Error("network unavailable");
            },
        ],
        [
            "an invalid JSON response",
            async () =>
                new Response("not-json", {
                    headers: { "content-type": "application/json" },
                }),
        ],
    ])("keeps the base endpoint when the field source returns %s", async (_name, respond) => {
        const probe = createSourceOverlayFetchProbe(respond);
        const repository = await dynamicOverlayRepository(probe.fetchImpl);

        await expect(repository.getEndpoint(targetEndpoint.urn)).resolves.toEqual(targetEndpoint);
    });

    test("single-flights concurrent materialization lookups", async () => {
        const probe = createSourceOverlayFetchProbe(async () => Response.json(dynamicFieldsResponse));
        const repository = await dynamicOverlayRepository(probe.fetchImpl);

        const endpoints = await Promise.all(
            Array.from({ length: 4 }, () => repository.getEndpoint(targetEndpoint.urn)),
        );

        expect(endpoints).toEqual(Array.from({ length: 4 }, () => enrichedTargetEndpoint));
        expect(probe.count("/fields")).toBe(1);
        expect(probe.observations.every((entry) => new URL(entry.url).pathname === "/fields")).toBeTrue();
    });
});
