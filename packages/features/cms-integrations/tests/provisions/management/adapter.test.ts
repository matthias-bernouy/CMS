import { expect, test } from "bun:test";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { ConfiguredSupabaseConnectorDeployer } from "@bernouy/cms-integrations/supabase";
import {
    InMemoryIntegrationConnectorProviderRepository,
    SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY,
    type IntegrationConnectorBinding,
} from "@bernouy/cms-integrations";
const binding: IntegrationConnectorBinding = {
    connectorKey: "primary",
    provider: "supabase",
    lineageId: "test",
    connectorInstanceId: "test",
    migrationRevision: 1,
    outputs: { functionsBaseUrl: "https://project-one.supabase.co/functions/v1" },
};
test("runtime sync writes only requested variables to the installed provider and rejects provider drift", async () => {
    const secrets = new InMemorySecretStore();
    await secrets.set(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY, "provider-token");
    const providerRepository = new InMemoryIntegrationConnectorProviderRepository({
        provider: "supabase",
        enabled: true,
        projectRef: "project-one",
    });
    const requests: Request[] = [];
    const deployer = new ConfiguredSupabaseConnectorDeployer({
        providerRepository,
        secrets,
        fetch: async (input, init) => {
            requests.push(new Request(input, init));
            return new Response(null, { status: 201 });
        },
    });
    await deployer.syncSecrets(binding, { APP_KEY: "granted-value" });
    expect(requests[0]!.url).toBe("https://api.supabase.com/v1/projects/project-one/secrets");
    expect(await requests[0]!.json()).toEqual([{ name: "APP_KEY", value: "granted-value" }]);
    await providerRepository.upsert({ provider: "supabase", enabled: true, projectRef: "project-two" });
    await expect(deployer.syncSecrets(binding, { APP_KEY: "granted-value" })).rejects.toThrow("does not match");
    expect(requests).toHaveLength(1);
});
