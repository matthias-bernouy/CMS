import { admitContractReleaseJson } from "cms-repository/exports/contracts";
import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { admitProviderManifestJson } from "cms-repository/providers/manifests/core/admission/admitProviderManifest";
import { parseProviderManifestJson } from "cms-repository/providers/manifests/core/parsing/parseProviderManifest";
import type { ProviderManifestCatalogue } from "cms-repository/providers/manifests/interfaces/ProviderManifestCatalogue";
import type { ProviderRepositorySource, RepositoryArtifactReference } from "./interfaces";
import { loadImplementedContracts } from "./implementedContracts";
import { stagedReleaseCatalogue } from "./stagedReleaseCatalogue";

/** Re-admit immutable bytes before publishing into the CMS-owned catalogues. */
export async function importRepositoryArtifact(
    source: ProviderRepositorySource,
    reference: RepositoryArtifactReference,
    contracts: ReleaseCatalogue,
    manifests: ProviderManifestCatalogue,
): Promise<{ kind: RepositoryArtifactReference["kind"]; id: string; version: string; digest: string }> {
    const listed = (await source.list(reference.kind)).find(
        (entry) =>
            entry.publisherId === reference.publisherId &&
            entry.id === reference.id &&
            entry.version === reference.version &&
            entry.digest === reference.digest,
    );
    if (!listed) {
        throw new Error("Artifact is not listed by this repository");
    }
    const bytes = await source.get(reference);
    if (reference.kind === "contract") {
        const admitted = await admitContractReleaseJson(bytes);
        const release = admitted.release;
        if (
            admitted.digest !== reference.digest ||
            release.publisherId !== reference.publisherId ||
            release.contractId !== reference.id ||
            release.version !== reference.version
        ) {
            throw new Error("Repository contract differs from its catalogue entry");
        }
        await contracts.publish(admitted);
        return { kind: reference.kind, id: release.contractId, version: release.version, digest: admitted.digest };
    }
    const parsedManifest = parseProviderManifestJson(bytes);
    assertProviderIdentity(parsedManifest, reference);
    const dependencies = await loadImplementedContracts(
        [source],
        parsedManifest.implementations,
        contracts,
        "implemented contract is not listed by this repository",
    );
    const admitted = await admitProviderManifestJson(bytes, stagedReleaseCatalogue(contracts, dependencies));
    const releasedManifest = admitted.manifest;
    if (
        admitted.digest !== reference.digest ||
        releasedManifest.provenance.publisherId !== reference.publisherId ||
        releasedManifest.providerId !== reference.id ||
        releasedManifest.version !== reference.version
    ) {
        throw new Error("Repository provider differs from its catalogue entry");
    }
    for (const dependency of dependencies) {
        await contracts.publish(dependency);
    }
    await manifests.publish(admitted);
    return {
        kind: reference.kind,
        id: releasedManifest.providerId,
        version: releasedManifest.version,
        digest: admitted.digest,
    };
}

function assertProviderIdentity(
    manifest: ReturnType<typeof parseProviderManifestJson>,
    reference: RepositoryArtifactReference,
): void {
    if (
        manifest.provenance.publisherId !== reference.publisherId ||
        manifest.providerId !== reference.id ||
        manifest.version !== reference.version
    ) {
        throw new Error("Repository provider differs from its catalogue entry");
    }
}
