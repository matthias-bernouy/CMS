import { describe, expect, test } from "bun:test";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";

describe("@bernouy/cms-integrations artifact parsing", () => {
    test("parses trigger, overlay, relation and dashboard relation artifacts", () => {
        const definition = parseIntegrationDefinition({
            kind: "products-offers-link",
            label: "Products offers link",
            inputs: [],
            artifacts: [
                {
                    type: "trigger",
                    trigger: {
                        id: "sync-offers",
                        event: { kind: "endpoint", source: "products", endpoint: "updateProduct", phase: "response" },
                        mode: "sync",
                        function: { id: "syncOffers", params: { productId: "$response.body.id" } },
                    },
                },
                {
                    type: "sourceOverlay",
                    overlay: {
                        id: "product-offers-fields",
                        sourceId: "products",
                        output: [{ endpointId: "product" }],
                        fields: [{ id: "offerCount", label: "Offer count", type: "number" }],
                    },
                },
                {
                    type: "relation",
                    relation: {
                        id: "product-offers",
                        from: { sourceId: "products", idPath: "id" },
                        to: { sourceId: "offers", idPath: "id" },
                        cardinality: "many",
                        binding: {
                            kind: "reference",
                            endpoint: { sourceId: "offers", endpointId: "offers" },
                            params: { productId: "$from.id" },
                        },
                    },
                },
                {
                    type: "dashboardRelation",
                    projection: {
                        relationId: "product-offers",
                        dashboardId: "products",
                        viewId: "productDetail",
                        widget: "w-table",
                    },
                },
            ],
        });

        expect(definition.artifacts?.map(artifact => artifact.type)).toEqual([
            "trigger",
            "sourceOverlay",
            "relation",
            "dashboardRelation",
        ]);
    });
});
