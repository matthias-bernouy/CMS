import { describe, expect, test } from "bun:test";

describe("local connector provider composition", () => {
    test("resolves Supabase deployment configuration from the local repositories", async () => {
        const composition = await Bun.file(new URL("../src/commands/dev/services.ts", import.meta.url)).text();
        const integrations = await Bun.file(new URL("../src/commands/dev/integrations.ts", import.meta.url)).text();

        expect(composition).toMatch(
            /const\s+secrets\s*=\s*new\s+ValidatingSecretStore\s*\(\s*LocalFsEnvSecretStore\.forSite\s*\(\s*options\.siteDir\s*\)\s*\)/,
        );
        expect(composition).toMatch(
            /createLocalIntegrationServices\s*\(\s*options\.siteDir\s*,[\s\S]*?secrets\s*,\s*\)/,
        );
        expect(integrations).toMatch(
            /const\s+integrationConnectorProviders\s*=\s*new\s+LocalFsIntegrationConnectorProviderRepository\s*\(\s*siteDir\s*\)/,
        );
        expect(integrations).toMatch(/new\s+ConfiguredSupabaseConnectorDeployer\s*\(\s*\{/);
        expect(integrations).toMatch(/providerRepository\s*:\s*integrationConnectorProviders\s*,/);
        expect(integrations).toMatch(/integrationConnectorProviders\s*,\s*integrationConnectorDeployers\s*,/);
        expect(integrations).toMatch(/functionSecrets\s*:\s*readSupabaseFunctionSecrets\s*\(\s*process\.env\s*\)\s*,/);
        expect(integrations).not.toContain("process.env.SUPABASE_");
        expect(integrations).not.toMatch(/new\s+SupabaseConnectorDeployer\s*\(/);
    });
});
