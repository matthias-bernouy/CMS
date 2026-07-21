import { describe, expect, test } from "bun:test";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";

describe("@bernouy/cms-integrations artifact parsing", () => {
    test("preserves bloc executable sources while normalizing metadata", () => {
        const viewJS = "  customElements.define('demo-card', class extends HTMLElement {});\n";
        const editorJS = "// Native editor behavior is provided by the browser.";
        const definition = parseIntegrationDefinition({
            kind: "bloc-pack",
            label: "Bloc pack",
            inputs: [],
            artifacts: [
                {
                    type: "bloc",
                    bloc: {
                        tag: "  demo-card  ",
                        name: "  Demo card  ",
                        group: "  Demo  ",
                        viewJS,
                        editorJS,
                    },
                },
            ],
        });

        expect(definition.artifacts?.[0]).toEqual({
            type: "bloc",
            bloc: {
                tag: "demo-card",
                name: "Demo card",
                group: "Demo",
                viewJS,
                editorJS,
            },
        });
    });

    test("omits a whitespace-only view source while preserving a null editor source", () => {
        const definition = parseIntegrationDefinition({
            kind: "native-bloc-pack",
            label: "Native bloc pack",
            inputs: [],
            artifacts: [
                {
                    type: "bloc",
                    bloc: {
                        tag: "native-image",
                        name: "Native image",
                        viewJS: "  \n\t",
                        editorJS: null,
                    },
                },
            ],
        });

        expect(definition.artifacts?.[0]).toMatchObject({
            type: "bloc",
            bloc: {
                editorJS: null,
            },
        });
        expect(definition.artifacts?.[0]).not.toHaveProperty("bloc.viewJS");
    });

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
                        fieldSource: {
                            endpointId: "offerFields",
                            map: { options: "choices" },
                        },
                        fields: [
                            {
                                id: "offerStatus",
                                label: "Offer status",
                                type: "string",
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
            "sourceOverlay",
            "relation",
            "dashboardRelation",
        ]);
        expect(definition.artifacts?.find((artifact) => artifact.type === "sourceOverlay")).toMatchObject({
            type: "sourceOverlay",
            overlay: {
                fieldSource: { endpointId: "offerFields", map: { options: "choices" } },
                fields: [
                    {
                        id: "offerStatus",
                        options: [
                            { value: "pending", label: "Pending" },
                            { value: "active", label: "Active" },
                        ],
                    },
                ],
            },
        });
    });

    test("parses recursive dashboard visibility with field and resource expressions", () => {
        const visibleWhen = {
            all: [
                { value: "$resource.status", equals: "draft" },
                {
                    any: [
                        { value: "$field.mode", equals: "advanced" },
                        { value: "$field.locale", notEquals: "fr" },
                    ],
                },
            ],
        };
        const definition = parseIntegrationDefinition(visibilityDefinition(visibleWhen));
        const artifact = definition.artifacts?.[0];

        expect(artifact).toMatchObject({
            type: "dashboard",
            dashboard: {
                views: [
                    {
                        actions: [{ visibleWhen }],
                        main: [{ fields: [{ id: "mode" }, { id: "locale" }, { id: "note", visibleWhen }] }],
                    },
                ],
            },
        });
    });

    test("rejects ambiguous, executable, and unbounded visibility rules", () => {
        const invalidRules: unknown[] = [
            { field: "mode", equals: "advanced" },
            { all: [], any: [] },
            { all: [{ value: "$field.mode", equals: "advanced" }], value: "$field.mode", equals: "advanced" },
            { all: "not-an-array" },
            { value: "$field.mode" },
            { value: "$field.mode", equals: "advanced", notEquals: "simple" },
            { value: "$field.mode", equals: "advanced", unexpected: true },
            { value: "$field.mode", equals: { script: "alert(1)" } },
            { value: "$user.role", equals: "admin" },
            { value: "$field.mode", equals: Number.NaN },
            deepVisibilityRule(),
        ];

        for (const rule of invalidRules) {
            expect(() => parseIntegrationDefinition(visibilityDefinition(rule))).toThrow();
        }
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

function visibilityDefinition(visibleWhen: unknown) {
    return {
        kind: "conditional-dashboard",
        label: "Conditional dashboard",
        inputs: [],
        artifacts: [
            {
                type: "dashboard",
                dashboard: {
                    id: "settings",
                    source: "settings",
                    views: [
                        {
                            widget: "w-detail",
                            id: "settingsDetail",
                            source: { endpoint: "setting" },
                            actions: [{ id: "save", label: "Save", endpoint: { endpoint: "save" }, visibleWhen }],
                            main: [
                                {
                                    id: "general",
                                    title: "General",
                                    fields: [
                                        { id: "mode", label: "Mode", path: "mode", type: "text" },
                                        { id: "locale", label: "Locale", path: "locale", type: "text" },
                                        { id: "note", label: "Note", path: "note", type: "text", visibleWhen },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
        ],
    };
}

function deepVisibilityRule(): unknown {
    let rule: unknown = { value: "$field.mode", equals: "advanced" };
    for (let index = 0; index < 10; index++) {
        rule = { all: [rule] };
    }
    return rule;
}
