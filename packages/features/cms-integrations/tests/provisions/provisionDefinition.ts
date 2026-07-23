import type { IntegrationDefinition } from "@bernouy/cms-integrations";

export function provisionedDefinition(): IntegrationDefinition {
    return {
        kind: "provisioned",
        label: "Provisioned integration",
        version: "1.0.0",
        inputs: [
            { name: "id", label: "Id", type: "text", required: true },
            { name: "apiKey", label: "API key", type: "password", required: true, secret: true },
        ],
        secrets: [{ input: "apiKey", key: "PROVISIONED_{{env answers.id}}_API_KEY" }],
        provisions: [
            {
                provider: "example",
                configuration: {
                    apiKey: "{{connectorSecrets.apiKey}}",
                    url: "{{connectors.supabase.functionsBaseUrl}}/webhook",
                },
                outputs: [{ name: "webhookSecret", key: "PROVISIONED_{{env answers.id}}_WEBHOOK_SECRET" }],
            },
        ],
        connectors: [
            {
                provider: "supabase",
                functions: [
                    {
                        name: "webhook",
                        directory: "functions/webhook",
                        secrets: { WEBHOOK_SECRET: "{{connectorSecrets.webhookSecret}}" },
                    },
                ],
            },
        ],
        artifacts: [],
    };
}
