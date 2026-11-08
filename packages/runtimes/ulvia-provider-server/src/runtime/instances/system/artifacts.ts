import { resourcePublisher } from "@bernouy/ulvia-contracts/protocol";
import { loadDocumentedContract } from "@bernouy/repository/providers/sources";
import type { AdmittedContractRelease, ResolvedContract } from "@bernouy/ulvia-contracts";
import { resolveContract } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/repository/contracts/catalogue";
import { admitProviderManifestJson, verifyStoredProviderManifestJson } from "@bernouy/ulvia-providers";
import type { ProviderRepositorySource, RepositoryArtifactEntry } from "@bernouy/repository/providers/sources";
import type { SystemInstallationPlan } from "@bernouy/ulvia-provider";
import { systemManifest } from "@bernouy/ulvia-provider";

export type LoadedSystemArtifacts = Readonly<{ plan: SystemInstallationPlan; contracts: readonly ResolvedContract[] }>;
export async function loadSystemArtifacts(providers: ProviderRepositorySource): Promise<LoadedSystemArtifacts> {
    const manifestEntry = exactEntry(
        await providers.list("provider-manifest"),
        systemManifest.providerId,
        systemManifest.version,
    );
    const bytes = await providers.get(manifestEntry);
    const stored = await verifyStoredProviderManifestJson(bytes, manifestEntry.digest);
    const catalogue = new InMemoryReleaseCatalogue();
    const entries = await providers.list("contract");
    const loaded = new Map<string, AdmittedContractRelease>();
    const admissions = await Promise.all(
        stored.manifest.implementations.map((pin) => loadContractWithAncestors(providers, entries, loaded, pin)),
    );
    await publishContractSet(catalogue, [...loaded.values()]);
    const contracts = await Promise.all(admissions.map((admission) => resolveContract(catalogue, admission)));
    const manifest = await admitProviderManifestJson(bytes, catalogue);
    if (manifest.digest !== manifestEntry.digest) {
        throw new Error("System manifest digest mismatch");
    }
    return Object.freeze({
        plan: Object.freeze({
            manifest: Object.freeze({
                providerId: manifest.manifest.providerId,
                version: manifest.manifest.version,
                digest: manifest.digest,
            }),
            contracts: Object.freeze(
                admissions.map(({ release, digest }) =>
                    Object.freeze({ contractId: release.contractId, version: release.version, digest }),
                ),
            ),
        }),
        contracts: Object.freeze(contracts),
    });
}

async function loadContractWithAncestors(
    source: ProviderRepositorySource,
    entries: readonly RepositoryArtifactEntry[],
    loaded: Map<string, AdmittedContractRelease>,
    coordinate: Readonly<{ contractId: string; version: string; digest: string }>,
): Promise<AdmittedContractRelease> {
    const key = `${coordinate.contractId}@${coordinate.version}`;
    const existing = loaded.get(key);
    if (existing) {
        if (existing.digest !== coordinate.digest) {
            throw new Error(`Official contract digest mismatch: ${key}`);
        }
        return existing;
    }
    const entry = exactEntry(entries, coordinate.contractId, coordinate.version);
    if (entry.digest !== coordinate.digest) {
        throw new Error(`Official contract coordinate mismatch: ${key}`);
    }
    const admission = await loadDocumentedContract(source, entry);
    if (
        admission.digest !== coordinate.digest ||
        admission.release.contractId !== coordinate.contractId ||
        admission.release.version !== coordinate.version
    ) {
        throw new Error(`Official contract digest mismatch: ${key}`);
    }
    loaded.set(key, admission);
    if (admission.release.extends) {
        await loadContractWithAncestors(source, entries, loaded, admission.release.extends);
    }
    return admission;
}

export async function loadOfficialManifest(
    source: ProviderRepositorySource,
    plan: SystemInstallationPlan,
): Promise<Uint8Array> {
    const { providerId, version, digest } = plan.manifest;
    const entry = exactEntry(await source.list("provider-manifest"), providerId, version);
    if (entry.digest !== digest) {
        throw new Error(`Official Provider manifest coordinate mismatch: ${providerId}@${version}`);
    }
    return source.get(entry);
}

function exactEntry(entries: readonly RepositoryArtifactEntry[], id: string, version: string): RepositoryArtifactEntry {
    const entry = entries.find(
        (candidate) =>
            candidate.publisherId === resourcePublisher(id) && candidate.id === id && candidate.version === version,
    );
    if (!entry) {
        throw new Error(`Exact official artifact is unavailable: ${id}@${version}`);
    }
    return entry;
}
