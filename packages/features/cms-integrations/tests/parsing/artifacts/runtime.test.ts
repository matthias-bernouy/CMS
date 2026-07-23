import { describe, expect, test } from "bun:test";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";

describe("@bernouy/cms-integrations runtime artifact parsing", () => {
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
                    type: "trigger",
                    trigger: {
                        id: "scheduled-sync",
                        critical: true,
                        event: {
                            kind: "schedule",
                            intervalMs: 30000,
                            initialDelayMs: 5000,
                            timeoutMs: 10000,
                        },
                        task: { id: "products.sync", body: { runKey: "$schedule.runKey" } },
                    },
                },
                {
                    type: "sourceOverlay",
                    overlay: {
                        id: "product-offers-fields",
                        sourceId: "products",
                        output: [{ endpointId: "product" }],
                        fieldSource: {
                            endpointId: "offerFields",
                            map: { nullable: "allowsNull", options: "choices" },
                        },
                        fields: [
                            {
                                id: "offerStatus",
                                label: "Offer status",
                                type: "string",
                                nullable: true,
                                options: [
                                    { value: "pending", label: "Pending" },
                                    { value: "active", label: "Active" },
                                ],
                            },
                        ],
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

        expect(definition.artifacts?.map((artifact) => artifact.type)).toEqual([
            "trigger",
            "trigger",
            "sourceOverlay",
            "relation",
            "dashboardRelation",
        ]);
        expect(definition.artifacts?.[1]).toMatchObject({
            type: "trigger",
            trigger: {
                id: "scheduled-sync",
                critical: true,
                event: { kind: "schedule", intervalMs: 30000, initialDelayMs: 5000, timeoutMs: 10000 },
                task: { id: "products.sync" },
            },
        });
        expect(definition.artifacts?.find((artifact) => artifact.type === "sourceOverlay")).toMatchObject({
            type: "sourceOverlay",
            overlay: {
                fieldSource: {
                    endpointId: "offerFields",
                    map: { nullable: "allowsNull", options: "choices" },
                },
                fields: [
                    {
                        id: "offerStatus",
                        nullable: true,
                        options: [
                            { value: "pending", label: "Pending" },
                            { value: "active", label: "Active" },
                        ],
                    },
                ],
            },
        });
    });

    test("rejects unsupported source overlay dashboard field types", () => {
        expect(() =>
            parseIntegrationDefinition({
                kind: "invalid-overlay-field",
                label: "Invalid overlay field",
                inputs: [],
                artifacts: [
                    {
                        type: "sourceOverlay",
                        overlay: {
                            id: "invalid-overlay-field",
                            sourceId: "products",
                            fields: [],
                            dashboardFields: [
                                {
                                    viewId: "productDetail",
                                    fieldId: "title",
                                    field: { type: "script" },
                                },
                            ],
                        },
                    },
                ],
            }),
        ).toThrow(/field\.type.*must be text\|number\|checkbox/);
    });

    test("normalizes supported source overlay dashboard field types", () => {
        const definition = parseIntegrationDefinition({
            kind: "normalized-overlay-field",
            label: "Normalized overlay field",
            inputs: [],
            artifacts: [
                {
                    type: "sourceOverlay",
                    overlay: {
                        id: "normalized-overlay-field",
                        sourceId: "products",
                        fields: [],
                        dashboardFields: [
                            {
                                viewId: "productDetail",
                                fieldId: "price",
                                field: { type: " number " },
                            },
                        ],
                    },
                },
            ],
        });

        expect(definition.artifacts?.[0]).toMatchObject({
            overlay: { dashboardFields: [{ field: { type: "number" } }] },
        });
    });
});
