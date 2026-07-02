import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationInstanceRepository,
    runIntegrationInstance,
    type IntegrationConnectorDeployer,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { TEST_SECRET_SOURCE_DEFINITION } from "./helpers";

describe("@bernouy/cms-integrations instance secrets", () => {
    test("tracks a named import without storing secret values", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const instances = new InMemoryIntegrationInstanceRepository();

        const result = await runIntegrationInstance({
            mode: "create",
            deps: { sources, secrets },
            instances,
            siteIntegrations: [TEST_SECRET_SOURCE_DEFINITION],
            dto: { kind: "test-secret-source", answers: { id: "secret-source-main", apiKey: "sk_test" }, options: {} },
        });

        expect(result.instance.id).toBe("test-secret-source:secret-source-main");
        expect(result.instance.runCount).toBe(1);
        expect(result.instance.artifacts).toEqual([{ type: "source", id: "urn:secret-source-main", action: "created" }]);
        const secretKey = result.instance.secretRefs.apiKey;
        expect(secretKey).toMatch(/^TEST_SOURCE_SECRET_SOURCE_MAIN_[A-F0-9]{8}_API_KEY$/);
        expect(JSON.stringify(result.instance)).not.toContain("sk_test");
        expect(await secrets.get(secretKey)).toBe("sk_test");
    });

    test("rejects password answers that are not declared as secrets", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const instances = new InMemoryIntegrationInstanceRepository();
        const definition: IntegrationDefinition = {
            kind: "password-only",
            label: "Password Only",
            inputs: [{ name: "password", label: "Password", type: "password", required: true }],
        };

        await expect(runIntegrationInstance({
            mode: "create",
            deps: { sources, secrets },
            instances,
            siteIntegrations: [definition],
            dto: {
                kind: "password-only",
                answers: { password: "plain_password" },
                options: {},
                instance: { id: "password-only:main" },
            },
        })).rejects.toThrow(/password inputs must declare secret: true/);

        expect(await instances.get("password-only:main")).toBeNull();
    });

    test("maps secret references by input name instead of declaration position", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const instances = new InMemoryIntegrationInstanceRepository();
        const definition: IntegrationDefinition = twoSecretsDefinition();

        const result = await runIntegrationInstance({
            mode: "create",
            deps: { sources, secrets },
            instances,
            siteIntegrations: [definition],
            dto: {
                kind: "two-secrets",
                answers: { id: "main", apiKey: "api", serviceKey: "service" },
                options: {},
            },
        });

        expect(result.instance.secretRefs).toEqual({ apiKey: "API_KEY", serviceKey: "SERVICE_KEY" });
    });

    test("tracks generated connector secrets without storing generated values on the instance", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const instances = new InMemoryIntegrationInstanceRepository();
        const deployer: IntegrationConnectorDeployer = {
            provider: "supabase",
            async deploy() {
                return { provider: "supabase", outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" } };
            },
        };

        const result = await runIntegrationInstance({
            mode: "create",
            deps: { sources, secrets, connectorDeployers: [deployer] },
            instances,
            siteIntegrations: [generatedSecretDefinition()],
            dto: { kind: "generated-secret", answers: { id: "main" }, options: {} },
        });

        expect(result.instance.secretInputs).toEqual(["cmsApiKey"]);
        expect(result.instance.secretRefs).toEqual({ cmsApiKey: "GENERATED_MAIN_API_KEY" });
        const generated = await secrets.get("GENERATED_MAIN_API_KEY");
        expect(generated?.startsWith("cms_")).toBe(true);
        if (!generated) throw new Error("missing generated secret");
        expect(JSON.stringify(result.instance)).not.toContain(generated);
        expect(result.instance.runs[0]?.connectors).toEqual([{
            provider: "supabase",
            outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
        }]);
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
        generatedSecrets: [{
            name: "cmsApiKey",
            key: "GENERATED_{{env answers.id}}_API_KEY",
            bytes: 16,
            prefix: "cms_",
        }],
        connectors: [{ provider: "supabase" }],
        artifacts: [{
            type: "source",
            source: {
                id: "{{answers.id}}",
                meta: { name: "Generated Secret" },
                endpoints: [{
                    endpointId: "health",
                    method: "GET",
                    targetUrl: "{{connectors.supabase.functionsBaseUrl}}/health",
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
