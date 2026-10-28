import { admitContractReleaseJson, type AdmittedContractRelease } from "cms-repository/exports/contracts";
import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { ProviderManifestValidationError } from "cms-repository/providers/manifests/core/protocol/errors";
import type { ProviderManifest } from "cms-repository/providers/manifests/interfaces/ProviderManifest";
import type { ProviderRepositorySource, RepositoryArtifactEntry, RepositoryArtifactReference } from "./interfaces";

export async function loadImplementedContracts(
    sources: readonly ProviderRepositorySource[],
    implementations: ProviderManifest["implementations"],
    contracts: ReleaseCatalogue,
    missingMessage: string,
): Promise<AdmittedContractRelease[]> {
    const entries = (
        await Promise.all(sources.map(async (source) => ({ source, entries: await source.list("contract") })))
    ).flatMap(({ source, entries }) => entries.map((entry) => ({ source, entry })));
    const dependencies = new Map<string, AdmittedContractRelease>();
    for (const [index, implementation] of implementations.entries()) {
        await loadContractLineage(
            entries,
            contracts,
            dependencies,
            implementation,
            missingMessage,
            `$.implementations[${index}]`,
        );
    }
    return [...dependencies.values()];
}

async function loadContractLineage(
    entries: readonly Readonly<{ source: ProviderRepositorySource; entry: RepositoryArtifactEntry }>[],
    contracts: ReleaseCatalogue,
    dependencies: Map<string, AdmittedContractRelease>,
    coordinate: Readonly<{ contractId: string; version: string; digest: string }>,
    missingMessage: string,
    path: string,
): Promise<void> {
    const key = `${coordinate.contractId}\u0000${coordinate.version}`;
    const pending = dependencies.get(key);
    if (pending) {
        if (pending.digest !== coordinate.digest) {
            throw new ProviderManifestValidationError("resolution_failed", missingMessage, path);
        }
        return;
    }
    const existing = await contracts.get(coordinate.contractId, coordinate.version);
    const admission = existing?.admission.digest === coordinate.digest ? existing.admission : undefined;
    const match = admission ? undefined : entries.find(({ entry }) => matchesCoordinate(entry, coordinate));
    if (!admission && !match) {
        throw new ProviderManifestValidationError("resolution_failed", missingMessage, path);
    }
    const loaded = admission ?? (await loadContract(match!.source, reference(match!.entry)));
    if (loaded.release.extends) {
        await loadContractLineage(entries, contracts, dependencies, loaded.release.extends, missingMessage, path);
    }
    if (!admission) {
        dependencies.set(key, loaded);
    }
}

async function loadContract(
    source: ProviderRepositorySource,
    value: RepositoryArtifactReference,
): Promise<AdmittedContractRelease> {
    const admitted = await admitContractReleaseJson(await source.get(value));
    const release = admitted.release;
    if (
        admitted.digest !== value.digest ||
        release.publisherId !== value.publisherId ||
        release.contractId !== value.id ||
        release.version !== value.version
    ) {
        throw new Error("Repository contract differs from its catalogue entry");
    }
    return admitted;
}

function matchesCoordinate(
    entry: RepositoryArtifactEntry,
    coordinate: Readonly<{ contractId: string; version: string; digest: string }>,
): boolean {
    return (
        entry.kind === "contract" &&
        entry.id === coordinate.contractId &&
        entry.version === coordinate.version &&
        entry.digest === coordinate.digest
    );
}

function reference(entry: RepositoryArtifactEntry): RepositoryArtifactReference {
    return {
        kind: "contract",
        publisherId: entry.publisherId,
        id: entry.id,
        version: entry.version,
        digest: entry.digest,
    };
}
