import { describe, expect, test } from "bun:test";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemoryRelationRepository } from "@bernouy/cms-relations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";

describe("@bernouy/cms-integrations declarative imports", () => {
    test("imports relation artifacts using dependency source ids", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const relations = new InMemoryRelationRepository();
        const installations = new InMemoryIntegrationInstallationRepository();
        await sources.createSource({
            urn: "urn:offers",
            meta: { name: "Offers" },
            endpoints: [
                {
                    urn: "urn:offers:offers",
                    method: "GET",
                    access: { mode: "public" },
                    targetUrl: "https://api.example.com/offers",
                    input: {
                        params: [
                            { name: "productId", in: "query", schema: { type: "string" } },
                            { name: "limit", in: "query", schema: { type: "number" } },
                            { name: "offset", in: "query", schema: { type: "number" } },
                        ],
                    },
                },
            ],
        });
        await installations.create({
            id: "products",
            label: "Products",
            definitionVersion: "1.0.0",
            status: "success",
            answersSnapshot: {},
            secretRefs: {},
            secretInputs: [],
            artifacts: [{ type: "source", id: "urn:products", action: "created" }],
            runs: [],
        });
        await installations.create({
            id: "offers",
            label: "Offers",
            definitionVersion: "1.0.0",
            status: "success",
            answersSnapshot: {},
            secretRefs: {},
            secretInputs: [],
            artifacts: [{ type: "source", id: "urn:offers", action: "created" }],
            runs: [],
        });
        const definition: IntegrationDefinition = {
            kind: "products-offers-link",
            label: "Products offers link",
            dependencies: [
                { name: "products", kind: "products" },
                { name: "offers", kind: "offers" },
            ],
            inputs: [],
            artifacts: [
                {
                    type: "relation",
                    relation: {
                        id: "product-offers",
                        label: "Offers",
                        from: { sourceId: "{{dependencies.products.sourceId}}", idPath: "id" },
                        to: { sourceId: "{{dependencies.offers.sourceId}}", idPath: "id" },
                        cardinality: "many",
                        binding: {
                            kind: "reference",
                            endpoint: {
                                sourceId: "{{dependencies.offers.sourceId}}",
                                endpointId: "offers",
                            },
                            params: { productId: "$from.id" },
                        },
                        page: {
                            itemsPath: "items",
                            totalPath: "total",
                            limitParam: "limit",
                            offsetParam: "offset",
                            defaultLimit: 25,
                            maxLimit: 100,
                        },
                    },
                },
            ],
        };

        const result = await importIntegration(
            { sources, secrets, installations, relations },
            { kind: "products-offers-link", answers: {}, options: {} },
            [definition],
        );

        expect(result.artifacts).toEqual([{ type: "relation", id: "product-offers", action: "created" }]);
        expect(await relations.getRelation("product-offers")).toMatchObject({
            from: { sourceId: "products" },
            to: { sourceId: "offers" },
            binding: {
                kind: "reference",
                endpoint: { sourceId: "offers", endpointId: "offers" },
            },
        });
    });
});
