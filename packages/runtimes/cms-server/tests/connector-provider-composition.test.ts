import { describe, expect, test } from "bun:test";

describe("production connector provider composition", () => {
    test("resolves Supabase deployment configuration from Mongo and the encrypted secret store", async () => {
        const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();

        const repository = source.indexOf("new MongoIntegrationConnectorProviderRepository(db)");
        const secrets = source.indexOf("new ValidatingSecretStore(new EncryptedMongoSecretStore({");
        const deployer = source.indexOf("new ConfiguredSupabaseConnectorDeployer({");

        expect(repository).toBeGreaterThan(-1);
        expect(secrets).toBeGreaterThan(-1);
        expect(deployer).toBeGreaterThan(repository);
        expect(deployer).toBeGreaterThan(secrets);
        expect(source).toContain("providerRepository: integrationConnectorProviders,");
        expect(source).toContain("integrationConnectorProviders,\n    integrationConnectorDeployers,");
        expect(source).toContain("functionSecrets: readSupabaseFunctionSecrets(process.env),");
        expect(source).not.toContain("source.SUPABASE_");
        expect(source).not.toContain("new SupabaseConnectorDeployer({");
    });
});
