import { admitContractRelease, type AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "cms-repository/contracts/default-implementation/memory/InMemoryReleaseCatalogue";
import { admitProviderManifest, type AdmittedProviderManifest } from "@bernouy/ulvia-providers";
import { InMemoryProviderManifestCatalogue } from "cms-repository/providers/manifests/default-implementation/InMemoryProviderManifestCatalogue";
import { InMemoryProviderInstallationStore } from "cms-repository/providers/installations/default-implementation/memory/InMemoryProviderInstallationStore";
import { ProviderInstallationLifecycle } from "cms-repository/providers/installations/core/lifecycle/ProviderInstallationLifecycle";
import { InMemoryContractSelectionStore } from "cms-repository/providers/selections/default-implementation/InMemoryContractSelectionStore";
import { contractDocument, implementation, manifestDocument, requirement } from "../support/fixtures";

export const siteId = "site:SHOP";
export const installationId = "installation:HUB";
export const accountId = "account:SHARED_SHOP";
export const scope = { siteId, installationId };

function commerceDocument(version: string, paymentRange: string) {
    const document = contractDocument("ulvia/commerce", "checkout", version);
    return document;
}

export async function providerWorld() {
    const releases = new InMemoryReleaseCatalogue();
    const admitted: AdmittedContractRelease[] = [];
    for (const document of [
        contractDocument("ulvia/payment", "create-link", "1.0.0"),
        contractDocument("ulvia/payment", "create-link", "2.0.0"),
        commerceDocument("1.0.0", "^1.0.0"),
        commerceDocument("1.1.0", "^1.0.0 || ^2.0.0"),
    ]) {
        const release = await admitContractRelease(document);
        await releases.publish(release);
        admitted.push(release);
    }
    const implementations = admitted.map(({ release, digest }) =>
        implementation(
            release.contractId,
            release.version,
            digest,
            release.contractId === "ulvia/commerce"
                ? [
                      requirement(
                          "ulvia/payment",
                          "create-link",
                          release.version === "1.0.0" ? "^1.0.0" : "^1.0.0 || ^2.0.0",
                      ),
                  ]
                : [],
        ),
    );
    const manifests = new InMemoryProviderManifestCatalogue(
        releases,
        undefined,
        () => new Date("2026-09-24T10:00:00Z"),
    );
    const previous = await admitProviderManifest(
        manifestDocument([implementations[0]!, implementations[2]!]),
        releases,
    );
    const next = await admitProviderManifest(manifestDocument(implementations, { version: "1.1.0" }), releases);
    await manifests.publish(previous);
    await manifests.publish(next);
    const pin = (contractId: string, version: string) => {
        contractId = contractId.includes("/") ? contractId : `ulvia/${contractId}`;
        const admission = admitted.find(
            (entry) => entry.release.contractId === contractId && entry.release.version === version,
        )!;
        return { siteId, contractId, version, digest: admission.digest, installationId };
    };
    return { releases, manifests, previous, next, pin };
}

export function candidate(admission: AdmittedProviderManifest) {
    return {
        id: installationId,
        siteId,
        providerId: admission.manifest.providerId,
        accountId,
        endpoint: "https://provider.example.com",
        manifestVersion: admission.manifest.version,
        manifestDigest: admission.digest,
        providerTokenRef: "${PROVIDER_TOKEN}",
        configuration: {},
    };
}

export function report(admission: AdmittedProviderManifest) {
    return {
        protocol: "ulvia-provider/v1",
        providerId: admission.manifest.providerId,
        instanceId: "instance:shared-shop",
        account: { id: accountId, label: "Shared shop" },
        buildVersion: "1.0.0",
        manifest: { version: admission.manifest.version, digest: admission.digest },
        implementations: admission.manifest.implementations.map(({ contractId, version, digest }) => ({
            contractId,
            version,
            digest,
            status: "ready",
        })),
    };
}

export async function providerSite() {
    const world = await providerWorld();
    let time = Date.parse("2026-09-24T10:00:01Z");
    const clock = () => new Date(time).toISOString();
    const installations = new InMemoryProviderInstallationStore(world.manifests, clock);
    const lifecycle = new ProviderInstallationLifecycle(installations, world.manifests, clock);
    // Catalogue fixtures never mutate in these workflows; installation revisions cover the changing dependencies.
    const snapshot = async (site: string) => {
        const records = await installations.list(site);
        return {
            releases: world.releases,
            manifests: world.manifests,
            installations: records.map((record) => record.installation),
            revision: JSON.stringify(records.map((record) => [record.installation.id, record.revision])),
        };
    };
    const selections = new InMemoryContractSelectionStore({
        capture: snapshot,
        isCurrent: async (site, revision) => (await snapshot(site)).revision === revision,
    });
    return {
        ...world,
        installations,
        lifecycle,
        selections,
        clock,
        tick: () => {
            time += 1_000;
        },
    };
}
