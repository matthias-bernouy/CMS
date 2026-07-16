import { describe, expect, test } from "bun:test";

describe("local connector provider composition", () => {
    test("resolves Supabase deployment configuration from the local repositories", async () => {
        const source = await Bun.file(new URL("../src/CLI_dev.ts", import.meta.url)).text();

        const repository = source.indexOf("new LocalFsIntegrationConnectorProviderRepository(config.siteDir)");
        const secrets = source.indexOf("new ValidatingSecretStore(LocalFsEnvSecretStore.forSite(config.siteDir))");
        const deployer = source.indexOf("new ConfiguredSupabaseConnectorDeployer({");

        expect(repository).toBeGreaterThan(-1);
        expect(secrets).toBeGreaterThan(-1);
        expect(deployer).toBeGreaterThan(repository);
        expect(deployer).toBeGreaterThan(secrets);
        expect(source).toContain("providerRepository: integrationConnectorProviders,");
        expect(source).toContain("integrationConnectorProviders,\n        integrationConnectorDeployers,");
        expect(source).toContain("functionSecrets: readSupabaseFunctionSecrets(process.env),");
        expect(source).not.toContain("process.env.SUPABASE_");
        expect(source).not.toContain("new SupabaseConnectorDeployer({");
    });
});
