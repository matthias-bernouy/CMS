import { expect, test } from "bun:test";
import { InMemorySecretStore, secretKeyToRef } from "@bernouy/secret-store";
import type { ProductionGateway } from "../../src/runtime/gateway/createProductionGateway";
import { ProviderManagement } from "../../src/runtime/gateway/ProviderManagement";

test("revoking a provider installation removes its stored credentials after the durable transition", async () => {
    const secrets = new InMemorySecretStore();
    await secrets.set("PROVIDER_TOKEN", "provider-secret");
    await secrets.set("GATEWAY_TOKEN", "gateway-secret");
    const installation = {
        id: "installation-1",
        siteId: "site-1",
        providerId: "provider.example",
        accountId: "account-1",
        endpoint: "https://provider.test",
        status: "enabled" as const,
        approval: {
            manifestVersion: "1.0.0",
            manifestDigest: `sha256:${"0".repeat(64)}` as const,
            approvedAt: "2026-01-01T00:00:00.000Z",
            approvedBy: "admin",
        },
        providerTokenRef: secretKeyToRef("PROVIDER_TOKEN"),
        gatewayTokenRef: secretKeyToRef("GATEWAY_TOKEN"),
        configuration: {},
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const installations = {
        get: async () => ({ installation, revision: 3 }),
        setStatus: async (_scope: unknown, revision: number, status: string) => ({
            installation: { ...installation, status },
            revision: revision + 1,
        }),
    };
    const gateway = {
        siteId: "site-1",
        installations,
        manifests: {},
    } as unknown as ProductionGateway;

    const result = await new ProviderManagement(gateway, secrets).setStatus({
        installationId: installation.id,
        revision: 3,
        action: "revoke",
    });

    expect(result).toEqual({
        installationId: installation.id,
        status: "revoked",
        revision: 4,
        credentialsDeleted: true,
    });
    expect(await secrets.get("PROVIDER_TOKEN")).toBeNull();
    expect(await secrets.get("GATEWAY_TOKEN")).toBeNull();
});
