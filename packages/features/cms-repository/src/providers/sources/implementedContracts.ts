import { admitContractReleaseJson, type AdmittedContractRelease } from "cms-repository/exports/contracts";
import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { ProviderManifestValidationError } from "cms-repository/providers/manifests/core/errors";
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
    const dependencies: AdmittedContractRelease[] = [];
    for (const [index, implementation] of implementations.entries()) {
        const existing = await contracts.get(implementation.contractId, implementation.version);
        if (existing?.admission.digest === implementation.digest) {
            continue;
        }
        const match = entries.find(({ entry }) => matchesImplementation(entry, implementation));
        if (!match) {
            throw new ProviderManifestValidationError(
                "resolution_failed",
                missingMessage,
                `$.implementations[${index}]`,
            );
        }
        dependencies.push(await loadContract(match.source, reference(match.entry)));
    }
    return dependencies;
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

function matchesImplementation(
    entry: RepositoryArtifactEntry,
    implementation: ProviderManifest["implementations"][number],
): boolean {
    return (
        entry.kind === "contract" &&
        entry.id === implementation.contractId &&
        entry.version === implementation.version &&
        entry.digest === implementation.digest
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
