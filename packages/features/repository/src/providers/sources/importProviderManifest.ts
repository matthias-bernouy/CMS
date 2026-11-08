import { admitProviderManifestJson } from "@bernouy/ulvia-providers";
import { parseProviderManifestJson } from "@bernouy/ulvia-providers";
import type { ProviderManifestCatalogue } from "repository/providers/manifests/interfaces/ProviderManifestCatalogue";
import type { ReleaseCatalogue } from "repository/exports/contracts/catalogue";
import type { ProviderRepositorySource } from "./interfaces";
import { loadImplementedContracts } from "./imports/implementedContracts";
import { publishProviderImport } from "./imports/publishProviderImport";
import { stagedReleaseCatalogue } from "./imports/stagedReleaseCatalogue";

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
    await publishProviderImport(dependencies, admitted, contracts, manifests);
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
