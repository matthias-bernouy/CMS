import { parseIntegrationDefinition, type CollectionIntegrationDefinition } from "@bernouy/cms-integrations";

export function collectionDefinition(overrides: Record<string, unknown> = {}): CollectionIntegrationDefinition {
    return parseIntegrationDefinition({
        schema: "cms.integration.definition.v2",
        type: "collection",
        kind: "ulvia",
        label: "Ulvia",
        version: "1.0.0",
        inputs: [],
        theme: {
            categories: [
                {
                    id: "surface",
                    label: "Surface",
                    tokens: [
                        {
                            id: "surface-background",
                            label: "Background",
                            type: "color",
                            defaults: { light: "#fff", dark: "#111" },
                        },
                    ],
                },
            ],
        },
        resourceCategories: [
            { id: "commerce", label: "Commerce" },
            { id: "content", label: "Content" },
        ],
        resources: [
            {
                id: "ulvia/blocs/basic-paragraph",
                type: "bloc",
                artifact: "basic-paragraph",
                category: "content",
                defaultActive: true,
                theme: { contract: "ulvia-theme@1", required: ["surface-background"] },
            },
            {
                id: "ulvia/blocs/commerce-offer-list",
                type: "bloc",
                artifact: "commerce-offer-list",
                category: "commerce",
                endpoints: [
                    {
                        source: "commerce",
                        sourceVersion: "^3.0.0",
                        endpoint: "urn:commerce:listOffers",
                        contractVersion: "^1.0.0",
                        bindings: {
                            input: { "params.page": "state.page" },
                            output: { "state.offers": "200.body.items" },
                        },
                    },
                ],
            },
        ],
        artifacts: [
            {
                type: "bloc",
                bloc: { tag: "basic-paragraph", name: "Paragraph", compositionHTML: "<p></p>" },
            },
            {
                type: "bloc",
                bloc: { tag: "commerce-offer-list", name: "Offers", compositionHTML: "<section></section>" },
            },
        ],
        ...overrides,
    }) as CollectionIntegrationDefinition;
}

export function sourceDefinition() {
    return parseIntegrationDefinition({
        schema: "cms.integration.definition.v2",
        type: "source",
        kind: "commerce",
        label: "Commerce",
        version: "3.0.0",
        inputs: [],
        artifacts: [
            {
                type: "source",
                endpointContractVersion: "1.0.0",
                source: {
                    id: "commerce",
                    meta: { name: "Commerce" },
                    endpoints: [
                        {
                            endpointId: "listOffers",
                            method: "GET",
                            targetUrl: "https://example.com/offers",
                            params: [{ name: "page", in: "query", type: "number" }],
                            output: [
                                {
                                    status: "200",
                                    body: {
                                        type: "object",
                                        properties: {
                                            items: { type: "array", items: { type: "object" } },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            },
        ],
    });
}
