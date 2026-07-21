import { describe, expect, test } from "bun:test";
import {
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    SourceOverlaySourceRepository,
    type SourceEndpoint,
} from "@bernouy/cms-sources";
import { createSourceOverlayFetchProbe } from "./helpers/sourceOverlayFetchProbe";

const targetEndpoint: SourceEndpoint = {
    urn: "urn:accounts:getAccount",
    method: "GET",
    targetUrl: "https://api.example.com/account",
    access: { mode: "auth" },
    output: [
        {
            status: "200",
            body: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    profile: {
                        type: "object",
                        properties: { displayName: { type: "string" } },
                        required: ["displayName"],
                    },
                },
                required: ["id"],
            },
        },
    ],
};

const enrichedTargetEndpoint: SourceEndpoint = {
    ...targetEndpoint,
    output: [
        {
            status: "200",
            body: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    profile: {
                        type: "object",
                        properties: {
                            displayName: { type: "string" },
                            nickname: { type: "string", title: "Nickname" },
                        },
                        required: ["displayName", "nickname"],
                    },
                    metadata: {
                        type: "object",
                        properties: {
                            tags: {
                                type: "array",
                                items: { type: "string" },
                                title: "Tags",
                            },
                        },
                    },
                },
                required: ["id"],
            },
        },
    ],
};

const dynamicFieldsResponse = {
    fields: [
        {
            id: "nickname",
            label: "Nickname",
            type: "string",
            path: "profile.nickname",
            required: true,
            providerSecret: "payload-private-value",
        },
        { id: "tags", label: "Tags", type: "string", multiple: true },
        {
            id: "internalCode",
            label: "Internal code",
            type: "string",
            exposeToEditorSources: false,
        },
        { id: "nickname", label: "Duplicate nickname", type: "number" },
        { id: "invalid.field", label: "Invalid field", type: "string" },
    ],
    connectorSecrets: { token: "payload-connector-secret" },
};

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

async function dynamicOverlayRepository(fetchImpl: typeof fetch) {
    const inner = new InMemorySourceRepository();
    const overlays = new InMemorySourceOverlayRepository();
    await inner.createSource({
        urn: "urn:accounts",
        endpoints: [
            targetEndpoint,
            {
                urn: "urn:accounts:listFields",
                method: "GET",
                targetUrl: "https://api.example.com/fields",
                headers: [
                    {
                        name: "Authorization",
                        source: {
                            from: "secret",
                            ref: "${ACCOUNT_FIELDS_KEY}",
                            prefix: "Bearer ",
                        },
                    },
                ],
                output: [{ status: "200", body: { type: "object" } }],
            },
        ],
    });
    await overlays.upsertOverlay({
        id: "account-fields",
        sourceId: "accounts",
        output: [{ endpointId: "getAccount" }],
        fieldSource: { endpointId: "listFields" },
        fields: [],
    });
    return new SourceOverlaySourceRepository(inner, overlays, {
        deps: {
            fetchImpl,
            resolveSecret: async () => "resolved-field-source-secret",
        },
    });
}
