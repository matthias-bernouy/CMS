import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import type { CollectionRepositorySource } from "@bernouy/cms-repository/collections/sources";
import {
    admitContractReleaseJson,
    type AdmittedContractRelease,
    type ContractRelease,
} from "@bernouy/cms-repository/contracts";
import {
    effectiveLineageCapabilities,
    InMemoryReleaseCatalogue,
    publishContractSet,
    resolveContractLineage,
} from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifestJson, verifyStoredProviderManifestJson } from "@bernouy/cms-repository/providers";
import type { ProviderRepositorySource, RepositoryArtifactEntry } from "@bernouy/cms-repository/providers/sources";
import type { OfficialInstanceProfile } from "@bernouy/ulvia-provider";

const PROFILE = Object.freeze({
    id: "ulvia.official",
    version: "1.0.0",
    upgradeFromVersions: Object.freeze([] as string[]),
    manifest: Object.freeze({ providerId: "ulvia.official", version: "0.3.0" }),
    collection: Object.freeze({
        publisherId: "ulvia.official",
        collectionId: "ulvia-official",
        version: "1.0.0",
    }),
});

export type LoadedOfficialArtifacts = Readonly<{
    profile: OfficialInstanceProfile;
    contracts: readonly ContractRelease[];
}>;

export async function loadOfficialArtifacts(
    providers: ProviderRepositorySource,
    collections: CollectionRepositorySource,
): Promise<LoadedOfficialArtifacts> {
    const manifestEntry = exactEntry(
        await providers.list("provider-manifest"),
        PROFILE.manifest.providerId,
        PROFILE.manifest.version,
    );
    const manifestBytes = await providers.get(manifestEntry);
    const storedManifest = await verifyStoredProviderManifestJson(manifestBytes, manifestEntry.digest);
    const catalogue = new InMemoryReleaseCatalogue();
    const contractEntries = await providers.list("contract");
    const loadedAdmissions = new Map<string, AdmittedContractRelease>();
    const implementationAdmissions = await Promise.all(
        storedManifest.manifest.implementations.map(async (coordinate) => {
            return loadContractWithAncestors(providers, contractEntries, loadedAdmissions, coordinate);
        }),
    );
    await publishContractSet(catalogue, [...loadedAdmissions.values()]);
    const effectiveContracts = await Promise.all(
        implementationAdmissions.map(async ({ release }) =>
            Object.freeze({
                ...release,
                capabilities: effectiveLineageCapabilities(await resolveContractLineage(catalogue, release)),
            }),
        ),
    );
    const manifest = await admitProviderManifestJson(manifestBytes, catalogue);
    if (manifest.digest !== manifestEntry.digest) {
        throw new Error(
            `Official Provider manifest digest mismatch: ${manifest.manifest.providerId}@${manifest.manifest.version}`,
        );
    }
    const collectionEntry = (await collections.list()).find(
        (entry) =>
            entry.publisherId === PROFILE.collection.publisherId &&
            entry.collectionId === PROFILE.collection.collectionId &&
            entry.version === PROFILE.collection.version,
    );
    if (!collectionEntry) {
        throw new Error(
            `Exact official artifact is unavailable: ${PROFILE.collection.collectionId}@${PROFILE.collection.version}`,
        );
    }
    const collectionBundle = await collections.get(collectionEntry);
    const collection = await admitCollectionRelease(collectionBundle.release, collectionBundle.assets, {
        contracts: catalogue,
    });
    if (collection.digest !== collectionEntry.digest) {
        throw new Error(
            `Official collection digest mismatch: ${PROFILE.collection.collectionId}@${PROFILE.collection.version}`,
        );
    }
    const profile: OfficialInstanceProfile = Object.freeze({
        id: PROFILE.id,
        version: PROFILE.version,
        upgradeFromVersions: PROFILE.upgradeFromVersions,
        manifest: Object.freeze({
            providerId: manifest.manifest.providerId,
            version: manifest.manifest.version,
            digest: manifest.digest,
        }),
        contracts: Object.freeze(
            implementationAdmissions.map(({ digest, release }) =>
                Object.freeze({ contractId: release.contractId, version: release.version, digest }),
            ),
        ),
        collection: Object.freeze({
            publisherId: collection.release.publisherId,
            collectionId: collection.release.collectionId,
            version: collection.release.version,
            digest: collection.digest,
        }),
    });
    return Object.freeze({
        profile,
        contracts: Object.freeze(effectiveContracts),
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
    const admission = await admitContractReleaseJson(await source.get(entry));
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
    profile: OfficialInstanceProfile,
): Promise<Uint8Array> {
    const { providerId, version, digest } = profile.manifest;
    const entry = exactEntry(await source.list("provider-manifest"), providerId, version);
    if (entry.digest !== digest) {
        throw new Error(`Official Provider manifest coordinate mismatch: ${providerId}@${version}`);
    }
    return source.get(entry);
}

function exactEntry(entries: readonly RepositoryArtifactEntry[], id: string, version: string): RepositoryArtifactEntry {
    const entry = entries.find(
        (candidate) =>
            candidate.publisherId === PROFILE.manifest.providerId &&
            candidate.id === id &&
            candidate.version === version,
    );
    if (!entry) {
        throw new Error(`Exact official artifact is unavailable: ${id}@${version}`);
    }
    return entry;
}
