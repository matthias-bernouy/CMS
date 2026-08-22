import { describe, expect, test } from "bun:test";
import { reconstructSource } from "cms-cli/push/integrations/pull";

describe("reconstructSource (pull)", () => {
    test("rebuilds endpoint urns, parameter schemas, and indexing declarations", () => {
        const source = reconstructSource({
            urn: "urn:test",
            id: "test",
            meta: { name: "Test Source", description: "Test data", icon: "database" },
            endpoints: [
                {
                    endpointId: "list",
                    method: "GET",
                    targetUrl: "https://api.example.com/items",
                    timeoutMs: 5_000,
                    access: { mode: "public" },
                    responseKind: "json",
                    params: [
                        { name: "q", in: "query", type: "string", required: true, description: "Search query" },
                        { name: "limit", in: "query", type: "number", required: false },
                    ],
                    output: [{ status: "200" }],
                },
            ],
            indexing: {
                entities: [
                    {
                        id: "item",
                        label: "Item",
                        resolve: {
                            endpointId: "list",
                            identity: { key: "id", inputParam: "q", outputPath: "id" },
                        },
                        discover: { endpointId: "list", itemsPath: "items", identityPath: "id" },
                        variables: { title: { path: "title", type: "text" } },
                        defaults: { titleTemplate: "${content.title}" },
                    },
                ],
            },
        });

        expect(source.urn).toBe("urn:test");
        expect(source.meta?.name).toBe("Test Source");
        expect(source.endpoints[0]).toMatchObject({
            urn: "urn:test:list",
            method: "GET",
            timeoutMs: 5_000,
            access: { mode: "public" },
            responseKind: "json",
        });
        expect(source.endpoints[0]?.input?.params?.[0]).toEqual({
            name: "q",
            in: "query",
            required: true,
            description: "Search query",
            schema: { type: "string" },
        });
        expect(source.endpoints[0]?.input?.params?.[1]).toEqual({
            name: "limit",
            in: "query",
            schema: { type: "number" },
        });
        expect(source.endpoints[0]?.output).toEqual([{ status: "200" }]);
        expect(source.indexing?.entities[0]).toMatchObject({
            resolve: { endpointUrn: "urn:test:list" },
            discover: { endpointUrn: "urn:test:list" },
            defaults: { titleTemplate: "${content.title}" },
        });
    });
});
