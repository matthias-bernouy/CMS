import { admitProviderManifestJson } from "cms-repository/providers/manifests/core/admission/admitProviderManifest";
import { parseProviderManifestJson } from "cms-repository/providers/manifests/core/parsing/parseProviderManifest";
import type { ProviderManifestCatalogue } from "cms-repository/providers/manifests/interfaces/ProviderManifestCatalogue";
import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import type { ProviderRepositorySource } from "./interfaces";
import { loadImplementedContracts } from "./implementedContracts";
import { stagedReleaseCatalogue } from "./stagedReleaseCatalogue";

/** Imports an administrator-supplied manifest after resolving its exact contracts from configured repositories. */
export async function importProviderManifest(
    bytes: string | Uint8Array,
    sources: readonly ProviderRepositorySource[],
    contracts: ReleaseCatalogue,
    manifests: ProviderManifestCatalogue,
) {
    const parsed = parseProviderManifestJson(bytes);
    const dependencies = await loadImplementedContracts(
        sources,
        parsed.implementations,
        contracts,
        "implemented contract is not available from the configured repositories",
    );
    const admitted = await admitProviderManifestJson(bytes, stagedReleaseCatalogue(contracts, dependencies));
    for (const dependency of dependencies) {
        await contracts.publish(dependency);
    }
    await manifests.publish(admitted);
    return {
        kind: admitted.manifest.kind,
        id: admitted.manifest.providerId,
        version: admitted.manifest.version,
        digest: admitted.digest,
        publisherId: admitted.manifest.provenance.publisherId,
        name: admitted.manifest.name,
        defaultOrigin: admitted.manifest.endpoint.defaultOrigin ?? "",
        links: admitted.manifest.links,
    };
}
