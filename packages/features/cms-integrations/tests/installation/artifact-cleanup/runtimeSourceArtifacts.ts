import type { IntegrationDefinition } from "@bernouy/cms-integrations";

export function runtimeSourceArtifacts(): NonNullable<IntegrationDefinition["artifacts"]> {
    return [
        {
            type: "source",
            source: {
                id: "products",
                meta: { name: "Products" },
                endpoints: [
                    {
                        endpointId: "product",
                        method: "GET",
                        targetUrl: "https://api.example.com/products",
                        params: [],
                        output: [
                            {
                                status: "200",
                                body: {
                                    type: "object",
                                    properties: {
                                        id: { type: "string" },
                                        item: {
                                            type: "object",
                                            properties: {
                                                id: { type: "string" },
                                                title: { type: "string" },
                                            },
                                        },
                                    },
                                },
                            },
                        ],
                    },
                ],
            },
        },
        {
            type: "source",
            source: {
                id: "offers",
                meta: { name: "Offers" },
                endpoints: [
                    {
                        endpointId: "offers",
                        method: "GET",
                        targetUrl: "https://api.example.com/offers",
                        params: [
                            { name: "productId", in: "query", type: "string" },
                            { name: "limit", in: "query", type: "number" },
                            { name: "offset", in: "query", type: "number" },
                        ],
                        output: [
                            {
                                status: "200",
                                body: {
                                    type: "object",
                                    properties: {
                                        items: {
                                            type: "array",
                                            items: { type: "object", properties: { id: { type: "string" } } },
                                        },
                                    },
                                },
                            },
                        ],
                    },
                ],
            },
        },
    ];
}
