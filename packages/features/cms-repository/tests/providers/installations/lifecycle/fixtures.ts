import { admitProviderManifest } from "cms-repository/providers/manifests/core/admission/admitProviderManifest";
import { InMemoryProviderManifestCatalogue } from "cms-repository/providers/manifests/default-implementation/InMemoryProviderManifestCatalogue";
import { ProviderInstallationLifecycle } from "cms-repository/providers/installations/core/lifecycle/ProviderInstallationLifecycle";
import { InMemoryProviderInstallationStore } from "cms-repository/providers/installations/default-implementation/memory/InMemoryProviderInstallationStore";
import type { ProviderInstallationWorkflowOptions } from "cms-repository/providers/installations/interfaces/ProviderInstallationStore";
import { contractDocument, implementation, manifestDocument, releaseCatalogue } from "../../support/fixtures";

export async function installationWorkflow(options: ProviderInstallationWorkflowOptions = {}) {
    let now = "2026-09-24T10:00:00.000Z";
    const clock = () => now;
    const contracts = await releaseCatalogue(contractDocument("payment", "create-link"));
    const release = (await contracts.list())[0]!.admission;
    const manifest = manifestDocument([implementation("payment", "1.0.0", release.digest)], {
        endpoint: { allowedOrigins: ["https://provider.example.com", "https://secondary.example.com"] },
        configuration: {
            type: "object",
            properties: { locale: { type: "string", maxLength: 2, enum: ["en", "fr"] } },
            required: ["locale"],
        },
    });
    const admission = await admitProviderManifest(manifest, contracts);
    const catalogue = new InMemoryProviderManifestCatalogue(
        contracts,
        undefined,
        () => new Date("2026-09-24T09:00:00Z"),
    );
    await catalogue.publish(admission);
    const candidate = {
        id: "installation:1",
        siteId: "site:1",
        providerId: "ulvia.example",
        accountId: "account:shared",
        endpoint: "https://provider.example.com",
        manifestVersion: admission.manifest.version,
        manifestDigest: admission.digest,
        providerTokenRef: "${PROVIDER_TOKEN}",
        gatewayTokenRef: "${GATEWAY_TOKEN}",
        configuration: { locale: "en" },
    };
    const report = {
        protocol: "ulvia-provider/v1",
        providerId: candidate.providerId,
        account: { id: candidate.accountId, label: "Shared account" },
        buildVersion: "1.4.0",
        manifest: { version: admission.manifest.version, digest: admission.digest },
        implementations: [{ contractId: "payment", version: "1.0.0", digest: release.digest, status: "ready" }],
    };
    const store = new InMemoryProviderInstallationStore(catalogue, clock, options);
    const lifecycle = new ProviderInstallationLifecycle(store, catalogue, clock, options);
    const scope = { installationId: candidate.id, siteId: candidate.siteId };
    return {
        contracts,
        catalogue,
        admission,
        manifest,
        candidate,
        report,
        store,
        lifecycle,
        scope,
        clock,
        setTime(value: string) {
            now = value;
        },
        async approve() {
            return lifecycle.approve(await lifecycle.prepare(candidate, report), "admin:owner");
        },
        async upgrade() {
            const next = await admitProviderManifest({ ...manifest, version: "2.0.0" }, contracts);
            await catalogue.publish(next);
            return {
                admission: next,
                report: { ...report, manifest: { version: next.manifest.version, digest: next.digest } },
            };
        },
    };
}
