import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationInstallationRepository,
    runIntegrationInstallation,
    type IntegrationConnectorDeployer,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { TEST_SECRET_SOURCE_DEFINITION } from "../helpers";

describe("@bernouy/cms-integrations installation secrets", () => {
    test("tracks a named import without storing secret values", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();

        const result = await runIntegrationInstallation({
            mode: "create",
            deps: { sources, secrets },
            installations,
            siteIntegrations: [TEST_SECRET_SOURCE_DEFINITION],
            dto: { kind: "test-secret-source", answers: { id: "secret-source-main", apiKey: "sk_test" }, options: {} },
        });

        expect(result.installation.id).toBe("test-secret-source");
        expect(result.installation.runCount).toBe(1);
        expect(result.installation.artifacts).toEqual([
            { type: "source", id: "urn:secret-source-main", action: "created" },
        ]);
        const secretKey = result.installation.secretRefs.apiKey;
        expect(secretKey).toMatch(/^TEST_SOURCE_SECRET_SOURCE_MAIN_[A-F0-9]{8}_API_KEY$/);
        expect(JSON.stringify(result.installation)).not.toContain("sk_test");
        expect(await secrets.get(secretKey)).toBe("sk_test");
    });

    test("rejects password answers that are not declared as secrets", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const definition: IntegrationDefinition = {
            kind: "password-only",
            label: "Password Only",
            inputs: [{ name: "password", label: "Password", type: "password", required: true }],
        };

        await expect(
            runIntegrationInstallation({
                mode: "create",
                deps: { sources, secrets },
                installations,
                siteIntegrations: [definition],
                dto: {
                    kind: "password-only",
                    answers: { password: "plain_password" },
                    options: {},
                },
            }),
        ).rejects.toThrow(/password inputs must declare secret: true/);

        expect(await installations.get("password-only")).toBeNull();
    });

    test("maps secret references by input name instead of declaration position", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const definition: IntegrationDefinition = twoSecretsDefinition();

        const result = await runIntegrationInstallation({
            mode: "create",
            deps: { sources, secrets },
            installations,
            siteIntegrations: [definition],
            dto: {
                kind: "two-secrets",
                answers: { id: "main", apiKey: "api", serviceKey: "service" },
                options: {},
            },
        });

        expect(result.installation.secretRefs).toEqual({ apiKey: "API_KEY", serviceKey: "SERVICE_KEY" });
    });

    test("tracks generated connector secrets without storing generated values on the installation", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const deployer: IntegrationConnectorDeployer = {
            provider: "supabase",
            async deploy() {
                return {
                    provider: "supabase",
                    outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
                };
            },
        };

        const result = await runIntegrationInstallation({
            mode: "create",
            deps: { sources, secrets, connectorDeployers: [deployer] },
            installations,
            siteIntegrations: [generatedSecretDefinition()],
            dto: { kind: "generated-secret", answers: { id: "main" }, options: {} },
        });

        expect(result.installation.secretInputs).toEqual(["cmsApiKey"]);
        expect(result.installation.secretRefs).toEqual({ cmsApiKey: "GENERATED_MAIN_API_KEY" });
        const generated = await secrets.get("GENERATED_MAIN_API_KEY");
        expect(generated?.startsWith("cms_")).toBe(true);
        if (!generated) {
            throw new Error("missing generated secret");
        }
        expect(JSON.stringify(result.installation)).not.toContain(generated);
        expect(result.installation.runs[0]?.connectors).toEqual([
            {
                provider: "supabase",
                outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
            },
        ]);
    });
});

function twoSecretsDefinition(): IntegrationDefinition {
    return {
        kind: "two-secrets",
        label: "Two Secrets",
        inputs: [
            { name: "id", label: "ID", type: "text", required: true },
            { name: "apiKey", label: "API Key", type: "password", required: true, secret: true },
            { name: "serviceKey", label: "Service Key", type: "password", required: true, secret: true },
        ],
        secrets: [
            { input: "serviceKey", key: "SERVICE_KEY" },
            { input: "apiKey", key: "API_KEY" },
        ],
    };
}

function generatedSecretDefinition(): IntegrationDefinition {
    return {
        kind: "generated-secret",
        label: "Generated Secret",
        inputs: [{ name: "id", label: "ID", type: "text", required: true }],
        generatedSecrets: [
            {
                name: "cmsApiKey",
                key: "GENERATED_{{env answers.id}}_API_KEY",
                bytes: 16,
                prefix: "cms_",
            },
        ],
        connectors: [{ provider: "supabase" }],
        artifacts: [
            {
                type: "source",
                source: {
                    id: "{{answers.id}}",
                    meta: { name: "Generated Secret" },
                    endpoints: [
                        {
                            endpointId: "health",
                            method: "GET",
                            targetUrl: "{{connectors.supabase.functionsBaseUrl}}/health",
                            params: [],
                            output: [{ status: "200", body: { type: "object" } }],
                            headers: [
                                {
                                    name: "authorization",
                                    source: { from: "secret", ref: "{{secrets.cmsApiKey}}", prefix: "Bearer " },
                                },
                            ],
                        },
                    ],
                },
            },
        ],
    };
}
