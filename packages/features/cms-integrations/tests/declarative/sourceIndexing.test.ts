import { describe, expect, test } from "bun:test";
import { importIntegration, type IntegrationDefinition } from "@bernouy/cms-integrations";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";

describe("declarative source indexing", () => {
    test("keeps page placeholders while resolving the surrounding source artifact", async () => {
        const sources = new InMemorySourceRepository();

        await importIntegration(
            { sources, roles: new InMemoryRolesRepository(), secrets: new InMemorySecretStore() },
            { kind: "indexed-catalog", answers: { sourceId: "catalog" }, options: {} },
            [definition()],
        );

        const source = await sources.getSource("urn:catalog");
        expect(source?.indexing?.entities[0]).toMatchObject({
            resolve: { endpointUrn: "urn:catalog:getProduct" },
            discover: { endpointUrn: "urn:catalog:listProducts" },
            defaults: {
                titleTemplate: "{{ name }}",
                descriptionTemplate: "Discover {{ name }} from {{ category }}.",
            },
        });
    });
});

function definition(): IntegrationDefinition {
    return {
        kind: "indexed-catalog",
        label: "Indexed catalog",
        inputs: [{ name: "sourceId", label: "Source id", type: "text", required: true }],
        artifacts: [
            {
                type: "source",
                source: {
                    id: "{{answers.sourceId}}",
                    meta: { name: "Catalog" },
                    endpoints: [endpoint("getProduct"), endpoint("listProducts")],
                    indexing: {
                        entities: [
                            {
                                id: "product",
                                resolve: {
                                    endpointId: "getProduct",
                                    identity: { key: "slug", inputParam: "slug", outputPath: "slug" },
                                },
                                discover: {
                                    endpointId: "listProducts",
                                    itemsPath: "items",
                                    identityPath: "slug",
                                },
                                variables: {
                                    name: { path: "name", type: "text" },
                                    category: { path: "category.name", type: "text" },
                                },
                                defaults: {
                                    titleTemplate: "{{ name }}",
                                    descriptionTemplate: "Discover {{ name }} from {{ category }}.",
                                },
                            },
                        ],
                    },
                },
            },
        ],
    };
}

function endpoint(endpointId: string) {
    const item = {
        type: "object" as const,
        properties: {
            slug: { type: "string" as const },
            name: { type: "string" as const },
            category: {
                type: "object" as const,
                properties: { name: { type: "string" as const } },
            },
        },
    };
    if (endpointId === "getProduct") {
        return {
            endpointId,
            method: "GET" as const,
            access: { mode: "public" as const },
            targetUrl: "https://api.example.test/products/{slug}",
            params: [{ name: "slug", in: "path" as const, type: "string" as const, required: true }],
            output: [{ status: "200", body: item }],
        };
    }
    return {
        endpointId,
        method: "GET" as const,
        access: { mode: "public" as const },
        targetUrl: "https://api.example.test/products",
        params: [],
        output: [
            {
                status: "200",
                body: {
                    type: "object" as const,
                    properties: { items: { type: "array" as const, items: item } },
                },
            },
        ],
    };
}
