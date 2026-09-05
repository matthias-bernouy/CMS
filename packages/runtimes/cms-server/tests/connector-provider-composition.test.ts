import { describe, expect, test } from "bun:test";

describe("production connector provider composition", () => {
    test("resolves Supabase deployment configuration from Mongo and the encrypted secret store", async () => {
        const core = await Bun.file(new URL("../src/runtime/stores/core.ts", import.meta.url)).text();
        const features = await Bun.file(new URL("../src/runtime/stores/features.ts", import.meta.url)).text();
        const integrations = await Bun.file(new URL("../src/runtime/integrations/index.ts", import.meta.url)).text();
        const entrypoint = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();

        expect(features).toMatch(
            /const\s+integrationConnectorProviders\s*=\s*new\s+MongoIntegrationConnectorProviderRepository\s*\(\s*db\s*\)/,
        );
        expect(core).toMatch(
            /const\s+secrets\s*=\s*new\s+ValidatingSecretStore\s*\(\s*new\s+EncryptedMongoSecretStore\s*\(\s*\{/,
        );
        expect(integrations).toMatch(/new\s+ConfiguredSupabaseConnectorDeployer\s*\(\s*\{/);
        expect(integrations).toMatch(/new\s+ConfiguredSupabaseConnectorMigrationAdapter\s*\(/);
        expect(integrations).toMatch(/new\s+ConfiguredSupabaseFunctionMigrationHandler\s*\(/);
        expect(integrations).toMatch(/new\s+ConfiguredSupabaseConnectorBaselineAdopter\s*\(/);
        expect(integrations).toMatch(/providerRepository\s*:\s*options\.providerRepository\s*,/);
        expect(integrations).toMatch(
            /functionSecrets\s*:\s*readSupabaseFunctionSecrets\s*\(\s*options\.environment\s*,\s*options\.supabase\s*\)\s*,/,
        );
        expect(entrypoint).toMatch(/providerRepository\s*:\s*features\.integrationConnectorProviders\s*,/);
        expect(entrypoint).toMatch(/secrets\s*:\s*core\.secrets\s*,/);
        expect(integrations).not.toContain("source.SUPABASE_");
        expect(integrations).not.toMatch(/integrationsRoot\s*:/);
        expect(integrations).not.toMatch(/new\s+SupabaseConnectorDeployer\s*\(/);
    });
});
