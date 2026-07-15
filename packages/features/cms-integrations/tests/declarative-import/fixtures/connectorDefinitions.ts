import type { IntegrationDefinition } from "@bernouy/cms-integrations";

export function connectorBackedDefinition(): IntegrationDefinition {
    return {
        kind: "connector-source",
        label: "Connector Source",
        version: "1.0.0",
        inputs: [{ name: "id", label: "Source id", type: "text", required: true }],
        generatedSecrets: [{
            name: "cmsApiKey",
            key: "CONNECTOR_{{env answers.id}}_API_KEY",
            bytes: 16,
            prefix: "cms_",
        }],
        connectors: [{
            provider: "supabase",
            root: "connectors/supabase",
            dataApiSchemas: [],
            schemas: [{ path: "schema.sql" }],
            functions: [{
                name: "cms-connector",
                directory: "functions/cms-connector",
                configPath: "supabase.config.toml",
                secrets: { CMS_API_KEY: "{{generated.cmsApiKey}}" },
            }],
        }],
        artifacts: [{
            type: "source",
            source: {
                id: "{{answers.id}}",
                meta: { name: "Connector source" },
                endpoints: [{
                    endpointId: "health",
                    method: "GET",
                    targetUrl: "{{connectors.supabase.functionsBaseUrl}}/cms-connector/health",
                    params: [],
                    headers: [{
                        name: "authorization",
                        source: { from: "secret", ref: "{{secrets.cmsApiKey}}", prefix: "Bearer " },
                    }],
                }],
            },
        }],
    };
}

export function connectorSecretBackedDefinition(): IntegrationDefinition {
    return {
        kind: "connector-secret-source",
        label: "Connector Secret Source",
        version: "1.0.0",
        inputs: [
            { name: "id", label: "Source id", type: "text", required: true },
            { name: "privateKey", label: "Private key", type: "password", required: true, secret: true },
            { name: "publicValue", label: "Public value", type: "text", required: true },
        ],
        secrets: [{ input: "privateKey", key: "CONNECTOR_{{env answers.id}}_PRIVATE_KEY" }],
        connectors: [{
            provider: "supabase",
            root: "connectors/supabase",
            functions: [{
                name: "cms-connector",
                directory: "functions/cms-connector",
                secrets: {
                    PRIVATE_KEY: "{{connectorSecrets.privateKey}}",
                    PUBLIC_VALUE: "{{answers.publicValue}}",
                },
            }],
        }],
        artifacts: [{
            type: "source",
            source: {
                id: "{{answers.id}}",
                meta: { name: "Connector secret source" },
                endpoints: [{
                    endpointId: "health",
                    method: "GET",
                    targetUrl: "{{connectors.supabase.functionsBaseUrl}}/cms-connector/health",
                    params: [],
                    headers: [{
                        name: "authorization",
                        source: { from: "secret", ref: "{{secrets.privateKey}}", prefix: "Bearer " },
                    }],
                }],
            },
        }],
    };
}
