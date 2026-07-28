import { describe, expect, test } from "bun:test";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import {
    InMemoryIntegrationConnectorProviderRepository,
    SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY,
} from "@bernouy/cms-integrations";
import { ConfiguredSupabaseConnectorDeployer } from "@bernouy/cms-integrations/supabase";
import { createSchemaFixture, emptyContext, emptyDeployment, schemaDeployment } from "./supabaseFixtures";

describe("ConfiguredSupabaseConnectorDeployer", () => {
    test("previews the public function URL without reading the access token", async () => {
        const providerRepository = new InMemoryIntegrationConnectorProviderRepository({
            provider: "supabase",
            enabled: true,
            projectRef: "project-one",
        });
        const deployer = new ConfiguredSupabaseConnectorDeployer({
            providerRepository,
            secrets: new InMemorySecretStore(),
        });

        expect(await deployer.previewOutputs()).toEqual({
            functionsBaseUrl: "https://project-one.supabase.co/functions/v1",
        });
    });

    test("reloads provider settings and the access token before every deployment", async () => {
        const packageRoot = await createSchemaFixture();
        const providerRepository = new InMemoryIntegrationConnectorProviderRepository();
        const secrets = new InMemorySecretStore();
        const requests: Array<{ url: string; authorization: string | null }> = [];
        const deployer = new ConfiguredSupabaseConnectorDeployer({
            providerRepository,
            secrets,
            apiBaseUrl: "https://api.supabase.test",
            fetch: async (input, init) => {
                requests.push({
                    url: String(input),
                    authorization: new Headers(init?.headers).get("authorization"),
                });
                return new Response(null, { status: 201 });
            },
        });

        await providerRepository.upsert({ provider: "supabase", enabled: true, projectRef: "project-one" });
        await secrets.set(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY, "sbp_first");
        const first = await deployer.deploy(schemaDeployment(), emptyContext(packageRoot));

        await providerRepository.upsert({ provider: "supabase", enabled: true, projectRef: "project-two" });
        await secrets.set(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY, "sbp_second");
        const second = await deployer.deploy(schemaDeployment(), emptyContext(packageRoot));

        expect(first.outputs).toEqual({ functionsBaseUrl: "https://project-one.supabase.co/functions/v1" });
        expect(second.outputs).toEqual({ functionsBaseUrl: "https://project-two.supabase.co/functions/v1" });
        expect(requests).toEqual([
            {
                url: "https://api.supabase.test/v1/projects/project-one/database/query",
                authorization: "Bearer sbp_first",
            },
            {
                url: "https://api.supabase.test/v1/projects/project-one/database/query",
                authorization: "Bearer sbp_first",
            },
            {
                url: "https://api.supabase.test/v1/projects/project-two/database/query",
                authorization: "Bearer sbp_second",
            },
            {
                url: "https://api.supabase.test/v1/projects/project-two/database/query",
                authorization: "Bearer sbp_second",
            },
        ]);
    });

    test("rejects missing, disabled, and incomplete provider settings", async () => {
        const providerRepository = new InMemoryIntegrationConnectorProviderRepository();
        const secrets = new InMemorySecretStore();
        const deployer = new ConfiguredSupabaseConnectorDeployer({
            providerRepository,
            secrets,
        });

        await expect(deployer.deploy(emptyDeployment(), emptyContext())).rejects.toThrow(
            "Supabase connector provider is not configured",
        );

        await providerRepository.upsert({ provider: "supabase", enabled: false, projectRef: "project-one" });
        await expect(deployer.deploy(emptyDeployment(), emptyContext())).rejects.toThrow(
            "Supabase connector provider is disabled",
        );

        await providerRepository.upsert({ provider: "supabase", enabled: true, projectRef: "   " });
        await expect(deployer.deploy(emptyDeployment(), emptyContext())).rejects.toThrow(
            "Supabase connector provider project reference is not configured",
        );
    });

    test("rejects a missing reserved access token", async () => {
        const providerRepository = new InMemoryIntegrationConnectorProviderRepository({
            provider: "supabase",
            enabled: true,
            projectRef: "project-one",
        });
        const deployer = new ConfiguredSupabaseConnectorDeployer({
            providerRepository,
            secrets: new InMemorySecretStore(),
        });

        await expect(deployer.deploy(emptyDeployment(), emptyContext())).rejects.toThrow(
            "Supabase connector provider access token is not configured",
        );
    });

    test("does not expose access-token values through configuration or deployment errors", async () => {
        const sensitiveToken = "sbp_do_not_expose";
        const providerRepository = new InMemoryIntegrationConnectorProviderRepository({
            provider: "supabase",
            enabled: true,
            projectRef: "project-one",
        });
        const unreadable = new ConfiguredSupabaseConnectorDeployer({
            providerRepository,
            secrets: {
                get: async () => {
                    throw new Error(`vault rejected ${sensitiveToken}`);
                },
            },
        });

        const readError = await capturedError(unreadable.deploy(emptyDeployment(), emptyContext()));
        expect(readError.message).toBe("Supabase connector provider access token could not be read");
        expect(readError.message).not.toContain(sensitiveToken);

        const packageRoot = await createSchemaFixture();
        const secrets = new InMemorySecretStore();
        await secrets.set(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY, sensitiveToken);
        const failingRequest = new ConfiguredSupabaseConnectorDeployer({
            providerRepository,
            secrets,
            apiBaseUrl: "https://api.supabase.test",
            fetch: async () => new Response(`request rejected bearer ${sensitiveToken}`, { status: 500 }),
        });

        const deploymentError = await capturedError(
            failingRequest.deploy(schemaDeployment(), emptyContext(packageRoot)),
        );
        expect(deploymentError.message).toContain("Supabase API request failed (500)");
        expect(deploymentError.message).toContain("[redacted]");
        expect(deploymentError.message).not.toContain(sensitiveToken);
    });
});

async function capturedError(promise: Promise<unknown>): Promise<Error> {
    try {
        await promise;
    } catch (error) {
        expect(error).toBeInstanceOf(Error);
        return error as Error;
    }
    throw new Error("expected operation to fail");
}
