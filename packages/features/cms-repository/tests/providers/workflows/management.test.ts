import { expect, test } from "bun:test";
import { ProviderManagement } from "@bernouy/cms-repository/providers/management";
import { InMemoryProviderInstallationStore } from "@bernouy/cms-repository/providers/installations";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { providerWorld, report, siteId } from "./fixtures";

test("provider management renews an approved installation observation with its stored credential", async () => {
    const world = await providerWorld();
    const installations = new InMemoryProviderInstallationStore(world.manifests, () => new Date().toISOString());
    const secrets = new InMemorySecretStore();
    const probes: { endpoint: string; token: string }[] = [];
    const management = new ProviderManagement(
        {
            siteId,
            releases: world.releases,
            manifests: world.manifests,
            installations,
            selections: {} as never,
        },
        secrets,
        {
            readReport: async (endpoint, token) => {
                probes.push({ endpoint, token });
                return report(world.previous);
            },
        },
    );
    const token = "provider-token-that-is-valid";
    const preview = await management.preview(
        {
            providerId: world.previous.manifest.providerId,
            version: world.previous.manifest.version,
            endpoint: "https://provider.example.com",
            token,
        },
        "administrator",
    );
    const approved = await management.approve(preview.ticket, "administrator");

    const refreshed = await management.refreshObservation(approved.installationId);

    expect(refreshed.revision).toBe(3);
    expect(refreshed.observation?.observedAt).toBeString();
    expect(probes).toEqual([
        { endpoint: "https://provider.example.com", token },
        { endpoint: "https://provider.example.com", token },
    ]);
});
