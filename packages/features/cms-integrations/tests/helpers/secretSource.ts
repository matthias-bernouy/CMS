import type { IntegrationDefinition } from "@bernouy/cms-integrations";

export const TEST_SECRET_SOURCE_DEFINITION: IntegrationDefinition = {
    kind: "test-secret-source",
    label: "Test secret source",
    version: "1.0.0",
    category: "Test",
    inputs: [
        { name: "id", label: "Source id", type: "text", required: true, defaultValue: "test-source" },
        { name: "apiKey", label: "API key", type: "password", required: true, secret: true },
    ],
    secrets: [{ input: "apiKey", key: "TEST_SOURCE_{{env answers.id}}_API_KEY" }],
    artifacts: [
        {
            type: "source",
            source: {
                id: "{{answers.id}}",
                meta: { name: "Test secret source", icon: "key" },
                endpoints: [
                    {
                        endpointId: "listItems",
                        method: "GET",
                        targetUrl: "https://api.example.com/items",
                        params: [],
                        output: [{ status: "200", body: { type: "object" } }],
                        headers: [
                            {
                                name: "authorization",
                                source: { from: "secret", ref: "{{secrets.apiKey}}", prefix: "Bearer " },
                            },
                        ],
                    },
                ],
            },
        },
    ],
};
