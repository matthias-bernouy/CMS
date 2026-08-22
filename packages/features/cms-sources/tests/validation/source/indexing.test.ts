import { describe, expect, test } from "bun:test";
import { validateSource, type Source } from "@bernouy/cms-sources";

describe("source indexing validation", () => {
    test("validates a complete indexable entity contract", () => {
        expect(validateSource(indexedSource())).toEqual([]);
    });

    test("rejects unusable endpoints and response paths", () => {
        const inaccessible = indexedSource();
        inaccessible.endpoints[0]!.access = { mode: "admin" };
        inaccessible.indexing!.entities[0]!.variables.name.path = "missing";
        const errors = validateSource(inaccessible);

        expect(errors).toContain(
            'invalid indexing entity "product".resolve.endpointUrn must reference a public endpoint',
        );
        expect(errors).toContain(
            'invalid indexing entity "product".variables.name.path must reference a declared string response value',
        );

        const mismatchedDiscovery = indexedSource();
        mismatchedDiscovery.indexing!.entities[0]!.discover.identityPath = "missing";
        mismatchedDiscovery.indexing!.entities[0]!.discover.pagination = {
            type: "cursor",
            cursorParam: "offset",
            nextCursorPath: "missing",
        };
        const discoveryErrors = validateSource(mismatchedDiscovery);
        expect(discoveryErrors.some((error) => error.includes("discover.identityPath"))).toBeTrue();
        expect(discoveryErrors.some((error) => error.includes("pagination.cursorParam"))).toBeTrue();
        expect(discoveryErrors.some((error) => error.includes("pagination.nextCursorPath"))).toBeTrue();
    });
});

function indexedSource(): Source {
    const item = {
        type: "object" as const,
        properties: {
            slug: { type: "string" as const },
            name: { type: "string" as const },
            updatedAt: { type: "string" as const },
        },
    };
    return {
        urn: "urn:catalog",
        endpoints: [
            {
                urn: "urn:catalog:getProduct",
                method: "GET",
                targetUrl: "https://api.example.test/products/{slug}",
                access: { mode: "public" },
                input: {
                    params: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
                },
                output: [{ status: "200", body: item }],
            },
            {
                urn: "urn:catalog:listProducts",
                method: "GET",
                targetUrl: "https://api.example.test/products",
                access: { mode: "public" },
                input: {
                    params: [
                        { name: "limit", in: "query", required: true, schema: { type: "number" } },
                        { name: "offset", in: "query", required: true, schema: { type: "number" } },
                    ],
                },
                output: [
                    {
                        status: "200",
                        body: {
                            type: "object",
                            properties: {
                                items: { type: "array", items: item },
                                total: { type: "number" },
                            },
                        },
                    },
                ],
            },
        ],
        indexing: {
            entities: [
                {
                    id: "product",
                    resolve: {
                        endpointUrn: "urn:catalog:getProduct",
                        identity: { key: "slug", inputParam: "slug", outputPath: "slug" },
                    },
                    discover: {
                        endpointUrn: "urn:catalog:listProducts",
                        itemsPath: "items",
                        identityPath: "slug",
                        lastModifiedPath: "updatedAt",
                        pagination: {
                            type: "offset",
                            limitParam: "limit",
                            offsetParam: "offset",
                            pageSize: 100,
                            totalPath: "total",
                        },
                    },
                    variables: { name: { path: "name", type: "text" } },
                    defaults: { titleTemplate: "{{ name }}" },
                },
            ],
        },
    };
}
