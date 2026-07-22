import { describe, expect, test } from "bun:test";
import {
    executeFunction,
    InMemoryFunctionRepository,
    withFunctionsSource,
    type CmsFunction,
} from "@bernouy/cms-functions";
import {
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    SourceOverlaySourceRepository,
    type SourceEndpoint,
} from "@bernouy/cms-sources";

describe("function source schema invalidation contract", () => {
    test("a successful internal invalidating call refreshes dynamic fields for the next lookup", async () => {
        let field = { id: "legacyCode", label: "Legacy code" };
        let fieldSourceCalls = 0;
        const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const request = new Request(input, init);
            const pathname = new URL(request.url).pathname;
            if (pathname === "/fields") {
                fieldSourceCalls += 1;
                return Response.json({ fields: [{ ...field, type: "string" }] });
            }
            if (pathname === "/refresh-schema") {
                field = { id: "freshCode", label: "Fresh code" };
                return Response.json({ schemaRevision: 2 });
            }
            return new Response("not found", { status: 404 });
        }) as typeof fetch;
        const overlayRepository = await overlaySources(fetchImpl);
        const sources = withFunctionsSource(overlayRepository, new InMemoryFunctionRepository());

        expect(await overlayRepository.getEndpoint(TARGET_ENDPOINT.urn)).toEqual(
            enrichedEndpoint("legacyCode", "Legacy code"),
        );
        expect(fieldSourceCalls).toBe(1);

        const response = await executeFunction(refreshFunction(), new Request("https://cms.test/refresh"), {
            sources,
            deps: { fetchImpl },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ schemaRevision: 2 });
        expect(await overlayRepository.getEndpoint(TARGET_ENDPOINT.urn)).toEqual(
            enrichedEndpoint("freshCode", "Fresh code"),
        );
        expect(fieldSourceCalls).toBe(2);
    });
});

const TARGET_ENDPOINT: SourceEndpoint = {
    urn: "urn:catalog:getProduct",
    method: "GET",
    targetUrl: "https://catalog.example/product",
    output: [
        {
            status: "200",
            body: { type: "object", properties: { id: { type: "string" } } },
        },
    ],
};

async function overlaySources(fetchImpl: typeof fetch): Promise<SourceOverlaySourceRepository> {
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
                    {
                        status: "200",
                        body: {
                            type: "object",
                            properties: { schemaRevision: { type: "number" } },
                        },
                    },
                ],
            },
        ],
    });
    await overlays.upsertOverlay({
        id: "catalog-fields",
        sourceId: "catalog",
        output: [{ endpointId: "getProduct" }],
        fieldSource: { endpointId: "listFields" },
        fields: [],
    });
    return new SourceOverlaySourceRepository(inner, overlays, { deps: { fetchImpl } });
}

function refreshFunction(): CmsFunction {
    return {
        id: "refreshCatalogSchema",
        method: "POST",
        steps: [
            {
                id: "refresh",
                call: { source: "catalog", endpoint: "refreshSchema" },
            },
        ],
        return: { body: "$steps.refresh" },
    };
}

function enrichedEndpoint(fieldId: string, label: string): SourceEndpoint {
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
