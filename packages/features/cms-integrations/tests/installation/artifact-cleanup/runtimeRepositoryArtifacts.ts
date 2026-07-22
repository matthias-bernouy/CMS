import type { IntegrationDefinition } from "@bernouy/cms-integrations";

export function runtimeRepositoryArtifacts(): NonNullable<IntegrationDefinition["artifacts"]> {
    return [
        {
            type: "function",
            function: {
                id: "syncOffers",
                method: "POST",
                steps: [],
                return: { status: 204 },
            },
        },
        {
            type: "trigger",
            trigger: {
                id: "sync-offers",
                event: { kind: "endpoint", source: "products", endpoint: "product", phase: "response" },
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
            type: "dashboard",
            dashboard: {
                id: "products",
                source: "products",
                views: [
                    {
                        widget: "w-detail",
                        id: "productDetail",
                        source: { endpoint: "product", itemPath: "item" },
                        main: [
                            {
                                id: "details",
                                title: "Details",
                                fields: [{ id: "title", label: "Title", type: "text", path: "title" }],
                            },
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
                page: { itemsPath: "items", limitParam: "limit", offsetParam: "offset" },
            },
        },
        {
            type: "dashboardRelation",
            projection: {
                type: "dashboardRelation",
                relationId: "product-offers",
                dashboardId: "products",
                viewId: "productDetail",
                widget: "table",
            },
        },
    ];
}
