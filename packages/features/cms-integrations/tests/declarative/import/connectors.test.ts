import { describe, expect, test } from "bun:test";
import {
    importIntegration,
    type IntegrationConnectorDeployContext,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { connectorBackedDefinition, connectorSecretBackedDefinition } from "./fixtures/connectorDefinitions";

describe("@bernouy/cms-integrations declarative imports", () => {
    test("deploys connectors before resolving connector-backed artifacts", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        let observed: {
            deployment: IntegrationConnectorDeployment;
            context: IntegrationConnectorDeployContext;
        } | null = null;
        const deployer: IntegrationConnectorDeployer = {
            provider: "supabase",
            async deploy(deployment, context) {
                observed = { deployment, context };
                return {
                    provider: "supabase",
                    outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
                    resources: [
                        { type: "schema", id: "schema.sql", action: "applied" },
                        { type: "function", id: "cms-connector", action: "deployed" },
                        { type: "secret", id: "CMS_API_KEY", action: "set" },
                    ],
                };
            },
        };
        const definition: IntegrationDefinition = connectorBackedDefinition();

        const result = await importIntegration(
            { sources, secrets, connectorDeployers: [deployer] },
            { kind: "connector-source", answers: { id: "main" }, options: {} },
            [definition],
        );

        expect(result.artifacts).toEqual([{ type: "source", id: "urn:main", action: "created" }]);
        expect(result.secrets).toEqual([{ input: "cmsApiKey", key: "CONNECTOR_MAIN_API_KEY", action: "created" }]);
        expect(result.connectors?.[0]).toEqual({
            provider: "supabase",
            outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
            resources: [
                { type: "schema", id: "schema.sql", action: "applied" },
                { type: "function", id: "cms-connector", action: "deployed" },
                { type: "secret", id: "CMS_API_KEY", action: "set" },
            ],
        });
        const generated = await secrets.get("CONNECTOR_MAIN_API_KEY");
        expect(generated?.startsWith("cms_")).toBe(true);
        expect(observed?.deployment).toEqual({
            integrationKind: "connector-source",
            version: "1.0.0",
            provider: "supabase",
            root: "connectors/supabase",
            dataApiSchemas: [],
            schemas: [{ path: "schema.sql" }],
            functions: [
                {
                    name: "cms-connector",
                    directory: "functions/cms-connector",
                    configPath: "supabase.config.toml",
                    secrets: { CMS_API_KEY: generated },
                },
            ],
        });
        expect(observed?.context.generated.cmsApiKey).toBe(generated);
        const installed = await sources.getSource("urn:main");
        expect(installed?.endpoints[0]?.targetUrl).toBe(
            "https://project.supabase.co/functions/v1/cms-connector/health",
        );
        expect(installed?.endpoints[0]?.headers?.[0]?.source).toEqual({
            from: "secret",
            ref: "${CONNECTOR_MAIN_API_KEY}",
            prefix: "Bearer ",
        });
    });

    test("passes secret input values to connector function secrets without leaking them", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        let observed: IntegrationConnectorDeployment | null = null;
        const deployer: IntegrationConnectorDeployer = {
            provider: "supabase",
            async deploy(deployment) {
                observed = deployment;
                return {
                    provider: "supabase",
                    outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
                };
            },
        };

        const result = await importIntegration(
            { sources, secrets, connectorDeployers: [deployer] },
            {
                kind: "connector-secret-source",
                answers: { id: "main", privateKey: "mr_private", publicValue: "visible" },
                options: {},
            },
            [connectorSecretBackedDefinition()],
        );

        expect(observed?.functions[0]?.secrets).toEqual({
            PRIVATE_KEY: "mr_private",
            PUBLIC_VALUE: "visible",
        });
        expect(result.secrets).toEqual([{ input: "privateKey", key: "CONNECTOR_MAIN_PRIVATE_KEY", action: "created" }]);
        expect(await secrets.get("CONNECTOR_MAIN_PRIVATE_KEY")).toBe("mr_private");
        expect(JSON.stringify(result)).not.toContain("mr_private");
    });

    test("keeps the unique provider alias for an explicitly keyed connector", async () => {
        const sources = new InMemorySourceRepository();
        const definition = connectorBackedDefinition();
        definition.connectors![0]!.connectorKey = "primary";
        const deployer: IntegrationConnectorDeployer = {
            provider: "supabase",
            async deploy() {
                return {
                    provider: "supabase",
                    outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
                };
            },
        };

        await importIntegration(
            { sources, secrets: new InMemorySecretStore(), connectorDeployers: [deployer] },
            { kind: "connector-source", answers: { id: "main" }, options: {} },
            [definition],
        );

        expect((await sources.getSource("urn:main"))?.endpoints[0]?.targetUrl).toBe(
            "https://project.supabase.co/functions/v1/cms-connector/health",
        );
    });

    test("rolls back generated secrets when a connector deployer is missing", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();

        await expect(
            importIntegration(
                { sources, secrets },
                { kind: "connector-source", answers: { id: "main" }, options: {} },
                [connectorBackedDefinition()],
            ),
        ).rejects.toThrow(/connector deployer "supabase" not configured/);

        expect(await secrets.listKeys()).toEqual([]);
        expect(await sources.getSource("urn:main")).toBeNull();
    });
});
