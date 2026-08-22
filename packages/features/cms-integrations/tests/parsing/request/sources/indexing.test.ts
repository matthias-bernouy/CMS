import { describe, expect, test } from "bun:test";
import { parseIntegrationImportRequest } from "@bernouy/cms-integrations";

describe("@bernouy/cms-integrations source indexing parsing", () => {
    test("parses declarations with declarative endpoint ids", () => {
        const request = parseIntegrationImportRequest({
            definition: definition({
                entities: [
                    {
                        id: "product",
                        label: "Product",
                        resolve: {
                            endpointId: "getProduct",
                            identity: { key: "slug", inputParam: "slug", outputPath: "slug" },
                        },
                        discover: {
                            endpointId: "listProducts",
                            itemsPath: "items",
                            identityPath: "slug",
                            pagination: {
                                type: "offset",
                                limitParam: "limit",
                                offsetParam: "offset",
                                pageSize: 100,
                                totalPath: "total",
                            },
                        },
                        variables: { name: { path: "name", type: "text" } },
                        defaults: { titleTemplate: "${content.name}" },
                    },
                ],
            }),
            answers: {},
        });

        const source = request.siteIntegrations[0]?.artifacts?.[0];
        expect(source?.type).toBe("source");
        if (source?.type === "source") {
            expect(source.source.indexing?.entities[0]).toMatchObject({
                id: "product",
                label: "Product",
                resolve: { endpointId: "getProduct" },
                discover: { endpointId: "listProducts", identityPath: "slug" },
                variables: { name: { path: "name", type: "text" } },
            });
        }
    });

    test("rejects unknown variable types", () => {
        const indexing = {
            entities: [
                {
                    id: "product",
                    label: "Product",
                    resolve: {
                        endpointId: "getProduct",
                        identity: { key: "slug", inputParam: "slug", outputPath: "slug" },
                    },
                    discover: {
                        endpointId: "listProducts",
                        itemsPath: "items",
                        identityPath: "slug",
                    },
                    variables: { name: { path: "name", type: "rich-text" } },
                },
            ],
        };

        expect(() => parseIntegrationImportRequest({ definition: definition(indexing), answers: {} })).toThrow(
            /indexing\.entities\.0\.variables\.name\.type.*text\|url\|image\|date\|number/,
        );
    });
});

function definition(indexing: unknown) {
    return {
        kind: "indexed-source",
        label: "Indexed source",
        inputs: [],
        artifacts: [
            {
                type: "source",
                source: {
                    id: "catalog",
                    meta: { name: "Catalog" },
                    endpoints: [],
                    indexing,
                },
            },
        ],
    };
}
