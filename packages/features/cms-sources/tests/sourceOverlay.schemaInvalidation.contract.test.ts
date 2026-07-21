import { describe, expect, test } from "bun:test";
import {
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    SourceOverlaySourceRepository,
    handleSourceRequest,
    type SourceEndpoint,
} from "@bernouy/cms-sources";
import { createSourceOverlayFetchProbe } from "./helpers/sourceOverlayFetchProbe";

const PREFIX = "/.cms/sources/";
const TARGET_ENDPOINT: SourceEndpoint = {
    urn: "urn:catalog:getProduct",
    method: "GET",
    targetUrl: "https://catalog.example/products/current",
    output: [
        {
            status: "200",
            body: {
                type: "object",
                properties: { id: { type: "string" } },
            },
        },
    ],
};

describe("dynamic source overlay schema invalidation contract", () => {
    test("a successful schema-invalidating endpoint exposes fresh dynamic fields on the next read", async () => {
        const harness = await schemaInvalidationHarness(200);

        expect(await harness.repository.getEndpoint(TARGET_ENDPOINT.urn)).toEqual(
            enrichedTargetEndpoint("legacyCode", "Legacy code"),
        );
        expect(harness.fieldSourceCalls()).toBe(1);

        const response = await handleSourceRequest(
            harness.repository,
            new Request(`http://cms.local${PREFIX}catalog/refreshSchema`, { method: "POST" }),
            { prefix: PREFIX, deps: { fetchImpl: harness.fetchImpl } },
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ schemaRevision: 2 });
        expect(harness.refreshCalls()).toBe(1);
        expect(harness.fieldSourceCalls()).toBe(1);
        expect(await harness.repository.getEndpoint(TARGET_ENDPOINT.urn)).toEqual(
            enrichedTargetEndpoint("freshCode", "Fresh code"),
        );
        expect(harness.fieldSourceCalls()).toBe(2);
    });

    test("a non-2xx schema-invalidating response does not start overlay rematerialization", async () => {
        const harness = await schemaInvalidationHarness(503);

        expect(await harness.repository.getEndpoint(TARGET_ENDPOINT.urn)).toEqual(
            enrichedTargetEndpoint("legacyCode", "Legacy code"),
        );
        expect(harness.fieldSourceCalls()).toBe(1);

        const response = await handleSourceRequest(
            harness.repository,
            new Request(`http://cms.local${PREFIX}catalog/refreshSchema`, { method: "POST" }),
            { prefix: PREFIX, deps: { fetchImpl: harness.fetchImpl } },
        );

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "schema refresh unavailable" });
        expect(harness.refreshCalls()).toBe(1);
        expect(harness.fieldSourceCalls()).toBe(1);
    });
});

async function schemaInvalidationHarness(refreshStatus: 200 | 503) {
    let schemaField = { id: "legacyCode", label: "Legacy code" };
    const probe = createSourceOverlayFetchProbe(async (request) => {
        const pathname = new URL(request.url).pathname;
        if (pathname === "/fields") {
            return Response.json({ fields: [{ ...schemaField, type: "string" }] });
        }
        if (pathname === "/refresh-schema" && refreshStatus === 200) {
            schemaField = { id: "freshCode", label: "Fresh code" };
            return Response.json({ schemaRevision: 2 });
        }
        if (pathname === "/refresh-schema") {
            return Response.json({ error: "schema refresh unavailable" }, { status: refreshStatus });
        }
        return new Response("not found", { status: 404 });
    });
    const inner = new InMemorySourceRepository();
    const overlays = new InMemorySourceOverlayRepository();
    await inner.createSource({
        urn: "urn:catalog",
        endpoints: [
            TARGET_ENDPOINT,
            {
                urn: "urn:catalog:listFields",
                method: "GET",
                targetUrl: "https://catalog.example/fields",
                output: [{ status: "200", body: { type: "object" } }],
            },
            {
                urn: "urn:catalog:refreshSchema",
                method: "POST",
                targetUrl: "https://catalog.example/refresh-schema",
                effects: { invalidatesSchema: true },
                output: [
                    { status: "200", body: { type: "object" } },
                    { status: "503", body: { type: "object" } },
                ],
            },
        ],
    });
    await overlays.upsertOverlay({
        id: "catalog-dynamic-fields",
        sourceId: "catalog",
        output: [{ endpointId: "getProduct" }],
        fieldSource: { endpointId: "listFields" },
        fields: [],
    });
    return {
        repository: new SourceOverlaySourceRepository(inner, overlays, {
            deps: { fetchImpl: probe.fetchImpl },
        }),
        fetchImpl: probe.fetchImpl,
        fieldSourceCalls: () => probe.count("/fields"),
        refreshCalls: () => probe.count("/refresh-schema"),
    };
}

function enrichedTargetEndpoint(fieldId: string, label: string): SourceEndpoint {
    return {
        ...TARGET_ENDPOINT,
        output: [
            {
                status: "200",
                body: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        metadata: {
                            type: "object",
                            properties: { [fieldId]: { type: "string", title: label } },
                        },
                    },
                },
            },
        ],
    };
}
