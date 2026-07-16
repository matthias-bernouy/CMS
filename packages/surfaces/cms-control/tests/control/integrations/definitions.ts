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
    secrets: [
        { input: "apiKey", key: "TEST_SOURCE_{{env answers.id}}_API_KEY" },
    ],
    artifacts: [{
        type: "source",
        source: {
            id: "{{answers.id}}",
            meta: { name: "Test secret source", icon: "key" },
            endpoints: [{
                endpointId: "listItems",
                method: "GET",
                targetUrl: "https://api.example.com/items",
                params: [],
                output: [{ status: "200", body: { type: "object" } }],
                headers: [{
                    name: "authorization",
                    source: { from: "secret", ref: "{{secrets.apiKey}}", prefix: "Bearer " },
                }],
            }],
        },
    }],
};

export function manualSourceDefinition(): IntegrationDefinition {
    return {
        kind: "manual-source",
        label: "Manual source",
        inputs: [
            { name: "id", label: "Source id", type: "text", required: true },
            { name: "targetUrl", label: "Target URL", type: "url", required: true },
        ],
        artifacts: [{
            type: "source",
            source: {
                id: "{{answers.id}}",
                meta: { name: "Manual source" },
                endpoints: [{
                    endpointId: "list",
                    method: "GET",
                    targetUrl: "{{answers.targetUrl}}",
                    params: [],
                    output: [{ status: "200", body: { type: "object" } }],
                }],
            },
        }],
    };
}

export function sourceWithFunctionDefinition(): IntegrationDefinition {
    return {
        kind: "function-source",
        label: "Function source",
        inputs: [
            { name: "id", label: "Source id", type: "text", required: true },
            { name: "targetUrl", label: "Target URL", type: "url", required: true },
        ],
        artifacts: [
            {
                type: "source",
                source: {
                    id: "{{answers.id}}",
                    meta: { name: "Function source" },
                    endpoints: [{
                        endpointId: "read",
                        method: "GET",
                        targetUrl: "{{answers.targetUrl}}",
                        params: [{ name: "itemId", in: "query", required: true, type: "string" }],
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
                    }],
                },
            },
            {
                type: "function",
                function: {
                    id: "readOwnedItem",
                    method: "GET",
                    input: { params: { itemId: { type: "string" } } },
                    steps: [{
                        id: "item",
                        call: {
                            source: "{{answers.id}}",
                            endpoint: "read",
                            params: { itemId: "$input.params.itemId" },
                        },
                    }],
                    return: { status: 200, body: "$steps.item" },
                },
            },
        ],
    };
}
