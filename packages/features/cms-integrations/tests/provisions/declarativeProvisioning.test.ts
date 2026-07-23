import { describe, expect, test } from "bun:test";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
    runIntegrationInstallation,
    type IntegrationConnectorDeployer,
    type IntegrationProvisioner,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { provisionedDefinition } from "./provisionDefinition";

describe("@bernouy/cms-integrations declarative provisions", () => {
    test("tracks provisioned signing secrets in the installation", async () => {
        const installations = new InMemoryIntegrationInstallationRepository();
        const secrets = new InMemorySecretStore();
        let existingOutputs: Record<string, string> = {};
        const provisioner: IntegrationProvisioner = {
            provider: "example",
            async provision(_deployment, context) {
                existingOutputs = context.existingOutputs;
                return { outputs: { webhookSecret: "whsec_created" } };
            },
        };
        const connector: IntegrationConnectorDeployer = {
            provider: "supabase",
            async previewOutputs() {
                return { functionsBaseUrl: "https://project.supabase.co/functions/v1" };
            },
            async deploy() {
                return { provider: "supabase" };
            },
        };

        const deps = {
            sources: new InMemorySourceRepository(),
            secrets,
            installations,
            provisioners: [provisioner],
            connectorDeployers: [connector],
        };
        const result = await runIntegrationInstallation({
            mode: "create",
            deps,
            installations,
            dto: {
                kind: "provisioned",
                answers: { id: "main", apiKey: "sk_test_private" },
                options: {},
            },
            siteIntegrations: [provisionedDefinition()],
        });

        expect(result.installation.secretRefs).toEqual({
            apiKey: "PROVISIONED_MAIN_API_KEY",
            webhookSecret: "PROVISIONED_MAIN_WEBHOOK_SECRET",
        });
        expect(result.installation.secretInputs).toEqual(["apiKey", "webhookSecret"]);

        await runIntegrationInstallation({
            mode: "rerun",
            deps,
            installations,
            integrationId: "provisioned",
            siteIntegrations: [provisionedDefinition()],
        });
        expect(existingOutputs).toEqual({ webhookSecret: "whsec_created" });
    });

    test("stores provisioned outputs and passes them to connectors without leaking values", async () => {
        const secrets = new InMemorySecretStore();
        let provisionConfiguration: Record<string, unknown> | undefined;
        let connectorSecret: string | undefined;
        const provisioner: IntegrationProvisioner = {
            provider: "example",
            async provision(deployment) {
                provisionConfiguration = deployment.configuration;
                return {
                    outputs: { webhookSecret: "whsec_created" },
                    resources: [{ type: "webhook", id: "we_123", action: "created" }],
                };
            },
        };
        const connector: IntegrationConnectorDeployer = {
            provider: "supabase",
            async previewOutputs() {
                return { functionsBaseUrl: "https://project.supabase.co/functions/v1" };
            },
            async deploy(deployment) {
                connectorSecret = deployment.functions[0]?.secrets?.WEBHOOK_SECRET;
                return { provider: "supabase" };
            },
        };

        const result = await importIntegration(
            {
                sources: new InMemorySourceRepository(),
                secrets,
                provisioners: [provisioner],
                connectorDeployers: [connector],
            },
            {
                kind: "provisioned",
                answers: { id: "main", apiKey: "sk_test_private" },
                options: {},
            },
            [provisionedDefinition()],
        );

        expect(provisionConfiguration).toEqual({
            apiKey: "sk_test_private",
            url: "https://project.supabase.co/functions/v1/webhook",
        });
        expect(connectorSecret).toBe("whsec_created");
        expect(await secrets.get("PROVISIONED_MAIN_WEBHOOK_SECRET")).toBe("whsec_created");
        expect(result.provisions).toEqual([
            {
                provider: "example",
                resources: [{ type: "webhook", id: "we_123", action: "created" }],
            },
        ]);
        expect(JSON.stringify(result)).not.toContain("sk_test_private");
        expect(JSON.stringify(result)).not.toContain("whsec_created");
    });

    test("rolls back new resources and secrets when connector deployment fails", async () => {
        const secrets = new InMemorySecretStore();
        let rolledBack = false;
        const provisioner: IntegrationProvisioner = {
            provider: "example",
            async provision() {
                return {
                    outputs: { webhookSecret: "whsec_created" },
                    rollback: async () => {
                        rolledBack = true;
                    },
                };
            },
        };
        const connector: IntegrationConnectorDeployer = {
            provider: "supabase",
            async previewOutputs() {
                return { functionsBaseUrl: "https://project.supabase.co/functions/v1" };
            },
            async deploy() {
                throw new Error("deployment failed");
            },
        };

        await expect(
            importIntegration(
                {
                    sources: new InMemorySourceRepository(),
                    secrets,
                    provisioners: [provisioner],
                    connectorDeployers: [connector],
                },
                {
                    kind: "provisioned",
                    answers: { id: "main", apiKey: "sk_test_private" },
                    options: {},
                },
                [provisionedDefinition()],
            ),
        ).rejects.toThrow("deployment failed");

        expect(rolledBack).toBe(true);
        expect(await secrets.listKeys()).toEqual([]);
    });
});
