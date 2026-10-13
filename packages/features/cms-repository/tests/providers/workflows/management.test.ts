import { expect, test } from "bun:test";
import { ProviderManagement } from "@bernouy/cms-repository/providers/management";
import { InMemoryProviderInstallationStore } from "@bernouy/cms-repository/providers/installations";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { candidate, providerSite, providerWorld, report, siteId } from "./fixtures";

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

test("provider management keeps selected installations enabled until their contracts are rerouted", async () => {
    const site = await providerSite();
    const approved = await site.lifecycle.approve(
        await site.lifecycle.prepare(candidate(site.previous), report(site.previous)),
        "administrator",
    );
    const selected = await site.selections.replace(
        siteId,
        [site.pin("commerce", "1.0.0"), site.pin("payment", "1.0.0")],
        0,
    );
    const management = new ProviderManagement(
        {
            siteId,
            releases: site.releases,
            manifests: site.manifests,
            installations: site.installations,
            selections: site.selections,
        },
        new InMemorySecretStore(),
        { readReport: async () => report(site.previous) },
    );

    for (const action of ["disable", "revoke"] as const) {
        await expect(
            management.setStatus({ installationId: approved.installation.id, revision: approved.revision, action }),
        ).rejects.toMatchObject({ code: "installation_selected", status: 409 });
    }
    expect(
        (await site.installations.get({ siteId, installationId: approved.installation.id }))?.installation.status,
    ).toBe("enabled");

    await site.selections.replace(siteId, [], selected.revision);
    const disabled = await management.setStatus({
        installationId: approved.installation.id,
        revision: approved.revision,
        action: "disable",
    });
    expect(disabled.status).toBe("disabled");
});
