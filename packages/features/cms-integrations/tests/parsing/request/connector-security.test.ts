import { describe, expect, test } from "bun:test";
import { collectIntegrationDefinitionCspExtras, parseIntegrationImportRequest } from "@bernouy/cms-integrations";

describe("@bernouy/cms-integrations connector and security DTO parsing", () => {
    test("parses generated secrets and connector deployment metadata", () => {
        const request = parseIntegrationImportRequest({
            definition: {
                kind: "connector",
                label: "Connector",
                inputs: [{ name: "id", label: "Source id", type: "text", required: true }],
                generatedSecrets: [
                    {
                        name: "cmsApiKey",
                        key: "CONNECTOR_{{env answers.id}}_API_KEY",
                        generator: "token",
                        bytes: 32,
                        prefix: "cms_",
                    },
                ],
                connectors: [
                    {
                        provider: "supabase",
                        root: "connectors/supabase",
                        dataApiSchemas: ["user_account"],
                        schemas: ["schema.sql"],
                        functions: [
                            {
                                name: "cms-connector",
                                directory: "functions/cms-connector",
                                configPath: "supabase.config.toml",
                                secrets: { CMS_API_KEY: "{{generated.cmsApiKey}}" },
                            },
                        ],
                    },
                ],
            },
            answers: { id: "main" },
        });

        expect(request.siteIntegrations[0]?.generatedSecrets).toEqual([
            {
                name: "cmsApiKey",
                key: "CONNECTOR_{{env answers.id}}_API_KEY",
                generator: "token",
                bytes: 32,
                prefix: "cms_",
            },
        ]);
        expect(request.siteIntegrations[0]?.connectors).toEqual([
            {
                provider: "supabase",
                root: "connectors/supabase",
                dataApiSchemas: ["user_account"],
                schemas: [{ path: "schema.sql" }],
                functions: [
                    {
                        name: "cms-connector",
                        directory: "functions/cms-connector",
                        configPath: "supabase.config.toml",
                        secrets: { CMS_API_KEY: "{{generated.cmsApiKey}}" },
                    },
                ],
            },
        ]);
    });

    test("parses declarative CSP security metadata", () => {
        const request = parseIntegrationImportRequest({
            definition: {
                kind: "secure-embed",
                label: "Secure Embed",
                inputs: [],
                security: {
                    csp: {
                        script: ["https://connect-js.stripe.com/v1.0/connect.js"],
                        frame: ["https://connect.stripe.com/embedded/loading"],
                        connect: ["https://api.stripe.com", "https://api.stripe.com/v1/account_sessions"],
                    },
                },
            },
            answers: {},
        });

        expect(request.siteIntegrations[0]?.security).toEqual({
            csp: {
                script: ["https://connect-js.stripe.com"],
                frame: ["https://connect.stripe.com"],
                connect: ["https://api.stripe.com"],
            },
        });
    });

    test("collects CSP extras from integration definitions", () => {
        const extras = collectIntegrationDefinitionCspExtras([
            {
                kind: "one",
                label: "One",
                inputs: [],
                security: {
                    csp: {
                        script: ["https://connect-js.stripe.com"],
                        frame: ["https://connect.stripe.com"],
                    },
                },
            },
            {
                kind: "two",
                label: "Two",
                inputs: [],
                security: {
                    csp: {
                        script: ["https://connect-js.stripe.com"],
                        connect: ["https://api.stripe.com"],
                    },
                },
            },
        ]);

        expect(extras).toEqual({
            connectExtras: ["https://api.stripe.com"],
            mediaExtras: [],
            styleExtras: [],
            scriptExtras: ["https://connect-js.stripe.com"],
            frameExtras: ["https://connect.stripe.com"],
        });
    });
});
