import { describe, expect, test } from "bun:test";

describe("production connector provider composition", () => {
    test("resolves Supabase deployment configuration from Mongo and the encrypted secret store", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();

        const repository = source.search(
            /const\s+integrationConnectorProviders\s*=\s*new\s+MongoIntegrationConnectorProviderRepository\s*\(\s*db\s*\)/,
        );
        const secrets = source.search(
            /const\s+secrets\s*=\s*new\s+ValidatingSecretStore\s*\(\s*new\s+EncryptedMongoSecretStore\s*\(\s*\{/,
        );
        const deployer = source.search(/new\s+ConfiguredSupabaseConnectorDeployer\s*\(\s*\{/);

        expect(repository).toBeGreaterThan(-1);
        expect(secrets).toBeGreaterThan(-1);
        expect(deployer).toBeGreaterThan(repository);
        expect(deployer).toBeGreaterThan(secrets);
        expect(source).toMatch(/providerRepository\s*:\s*integrationConnectorProviders\s*,/);
        expect(source).toMatch(/integrationConnectorProviders\s*,\s*integrationConnectorDeployers\s*,/);
        expect(source).toMatch(/functionSecrets\s*:\s*readSupabaseFunctionSecrets\s*\(\s*process\.env\s*\)\s*,/);
        expect(source).not.toContain("source.SUPABASE_");
        expect(source).not.toMatch(/new\s+SupabaseConnectorDeployer\s*\(/);
    });
});
