import { admitContractReleaseJson, type ContractRelease } from "@bernouy/cms-repository/contracts";
import type { ProviderRepositorySource, RepositoryArtifactEntry } from "@bernouy/cms-repository/providers/sources";
import { OFFICIAL_INSTANCE_PROFILE } from "@bernouy/ulvia-provider";

export async function loadOfficialContracts(source: ProviderRepositorySource): Promise<readonly ContractRelease[]> {
    const entries = await source.list("contract");
    return Promise.all(
        OFFICIAL_INSTANCE_PROFILE.contracts.map(async (coordinate) => {
            const entry = exactEntry(entries, coordinate.contractId, coordinate.version, coordinate.digest);
            const admission = await admitContractReleaseJson(await source.get(entry));
            if (admission.digest !== coordinate.digest) {
                throw new Error(`Official contract digest mismatch: ${coordinate.contractId}@${coordinate.version}`);
            }
            return admission.release;
        }),
    );
}

export async function loadOfficialManifest(source: ProviderRepositorySource): Promise<Uint8Array> {
    const { providerId, version, digest } = OFFICIAL_INSTANCE_PROFILE.manifest;
    const entry = exactEntry(await source.list("provider-manifest"), providerId, version, digest);
    return source.get(entry);
}

function exactEntry(
    entries: readonly RepositoryArtifactEntry[],
    id: string,
    version: string,
    digest: string,
): RepositoryArtifactEntry {
    const entry = entries.find(
        (candidate) =>
            candidate.publisherId === OFFICIAL_INSTANCE_PROFILE.manifest.providerId &&
            candidate.id === id &&
            candidate.version === version &&
            candidate.digest === digest,
    );
    if (!entry) {
        throw new Error(`Exact official artifact is unavailable: ${id}@${version} (${digest})`);
    }
    return entry;
}
