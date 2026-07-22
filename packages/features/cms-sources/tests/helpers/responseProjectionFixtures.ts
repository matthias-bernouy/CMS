import type { SourceEndpoint } from "cms-sources/interfaces/Source";

export function nestedResponseEndpoint(): SourceEndpoint {
    return {
        urn: "urn:orders:list",
        method: "GET",
        targetUrl: "https://api.example.test/orders",
        output: [
            {
                status: "200",
                body: {
                    type: "object",
                    properties: {
                        orders: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: { total: { type: "number" } },
                            },
                        },
                    },
                },
            },
        ],
    };
}
