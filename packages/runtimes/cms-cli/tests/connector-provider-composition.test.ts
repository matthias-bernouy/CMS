import { describe, expect, test } from "bun:test";

describe("local connector provider composition", () => {
    test("resolves Supabase deployment configuration from the local repositories", async () => {
        const source = await Bun.file(new URL("../src/CLI_dev.ts", import.meta.url)).text();

        const repository = source.search(
            /const\s+integrationConnectorProviders\s*=\s*new\s+LocalFsIntegrationConnectorProviderRepository\s*\(\s*config\.siteDir\s*\)/,
        );
        const secrets = source.search(
            /const\s+secrets\s*=\s*new\s+ValidatingSecretStore\s*\(\s*LocalFsEnvSecretStore\.forSite\s*\(\s*config\.siteDir\s*\)\s*\)/,
        );
        const deployer = source.search(/new\s+ConfiguredSupabaseConnectorDeployer\s*\(\s*\{/);

        expect(repository).toBeGreaterThan(-1);
        expect(secrets).toBeGreaterThan(-1);
        expect(deployer).toBeGreaterThan(repository);
        expect(deployer).toBeGreaterThan(secrets);
        expect(source).toMatch(/providerRepository\s*:\s*integrationConnectorProviders\s*,/);
        expect(source).toMatch(/integrationConnectorProviders\s*,\s*integrationConnectorDeployers\s*,/);
        expect(source).toMatch(/functionSecrets\s*:\s*readSupabaseFunctionSecrets\s*\(\s*process\.env\s*\)\s*,/);
        expect(source).not.toContain("process.env.SUPABASE_");
        expect(source).not.toMatch(/new\s+SupabaseConnectorDeployer\s*\(/);
    });
});
