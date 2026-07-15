import { Buffer } from "node:buffer";
import { describe, expect, test } from "bun:test";
import { importIntegration, type IntegrationDefinition } from "@bernouy/cms-integrations";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";

describe("@bernouy/cms-integrations declarative imports", () => {
    test("imports bloc artifacts through the injected bloc importer", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const imported: unknown[] = [];
        const definition: IntegrationDefinition = {
            kind: "bloc-pack",
            label: "Bloc Pack",
            inputs: [],
            artifacts: [{
                type: "bloc",
                bloc: {
                    tag: "demo-card",
                    name: "Demo card",
                    group: "Content",
                    viewJS: `customElements.define("demo-card", class extends HTMLElement {});`,
                    source: {
                        "Bloc.ts": Buffer.from(`customElements.define("demo-card", class extends HTMLElement {});`).toString("base64"),
                    },
                },
            }],
        };

        const result = await importIntegration(
            {
                sources,
                secrets,
                blocs: {
                    importBloc: async (artifact) => {
                        imported.push(artifact);
                        return { id: artifact.tag, action: "created" };
                    },
                },
            },
            { kind: "bloc-pack", answers: {}, options: {} },
            [definition],
        );

        expect(result.artifacts).toEqual([{ type: "bloc", id: "demo-card", action: "created" }]);
        expect(imported).toEqual([{
            tag: "demo-card",
            name: "Demo card",
            group: "Content",
            viewJS: `customElements.define("demo-card", class extends HTMLElement {});`,
            source: {
                "Bloc.ts": Buffer.from(`customElements.define("demo-card", class extends HTMLElement {});`).toString("base64"),
            },
        }]);
    });

    test("imports function artifacts after their source dependencies", async () => {
        const sources = new InMemorySourceRepository();
        const functions = new InMemoryFunctionRepository();
        const secrets = new InMemorySecretStore();
        const definition: IntegrationDefinition = {
            kind: "products",
            label: "Products",
            inputs: [],
            artifacts: [
                {
                    type: "source",
                    source: {
                        id: "products",
                        meta: { name: "Products" },
                        endpoints: [
                            {
                                endpointId: "getProduct",
                                method: "GET",
                                targetUrl: "https://example.com/products",
                                params: [{ name: "productId", in: "query", type: "string", required: true }],
                                output: [{
                                    status: "200",
                                    body: {
                                        type: "object",
                                        properties: {
                                            id: { type: "string" },
                                            ownerUserId: { type: "string" },
                                        },
                                    },
                                }],
                            },
                        ],
                    },
                },
                {
                    type: "function",
                    function: {
                        id: "readMyProduct",
                        method: "GET",
                        input: {
                            params: {
                                productId: { type: "string" },
                            },
                        },
                        steps: [
                            {
                                id: "product",
                                call: {
                                    source: "products",
                                    endpoint: "getProduct",
                                    params: { productId: "$input.params.productId" },
                                },
                            },
                            {
                                assert: {
                                    condition: { equals: ["$steps.product.ownerUserId", "$ctx.user.id"] },
                                    failure: { status: 403, error: "Not your product" },
                                },
                            },
                        ],
                        return: { body: "$steps.product" },
                    },
                },
            ],
        };

        const result = await importIntegration(
            { sources, functions, secrets },
            { kind: "products", answers: {}, options: {} },
            [definition],
        );

        expect(result.artifacts).toEqual([
            { type: "source", id: "urn:products", action: "created" },
            { type: "function", id: "readMyProduct", action: "created" },
        ]);
        expect(await functions.getFunction("readMyProduct")).toMatchObject({ id: "readMyProduct" });
    });
});
