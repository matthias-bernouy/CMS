import { CURRENT_PROFILE, SUPPORTED_PROFILES, type ProfileDefinition } from "./definitions";
import { initialPages } from "./initialPages";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import type { CollectionRepositorySource } from "@bernouy/cms-repository/collections/sources";
import {
    admitContractReleaseJson,
    type AdmittedContractRelease,
    type ResolvedContract,
} from "@bernouy/cms-repository/contracts";
import {
    resolveContract,
    InMemoryReleaseCatalogue,
    publishContractSet,
} from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifestJson, verifyStoredProviderManifestJson } from "@bernouy/cms-repository/providers";
import type { ProviderRepositorySource, RepositoryArtifactEntry } from "@bernouy/cms-repository/providers/sources";
import type { OfficialInstanceProfile } from "@bernouy/ulvia-provider";

export type LoadedOfficialArtifacts = Readonly<{
    profiles: readonly OfficialInstanceProfile[];
    defaultProfile: OfficialInstanceProfile;
    contracts: readonly ResolvedContract[];
}>;

export async function loadOfficialArtifacts(
    providers: ProviderRepositorySource,
    collections: CollectionRepositorySource,
): Promise<LoadedOfficialArtifacts> {
    const [manifestEntries, collectionEntries] = await Promise.all([
        providers.list("provider-manifest"),
        collections.list(),
    ]);
    const available = SUPPORTED_PROFILES.filter(
        (profile) =>
            hasEntry(manifestEntries, profile.manifest.providerId, profile.manifest.version) &&
            collectionEntries.some(
                (entry) =>
                    entry.publisherId === profile.collection.publisherId &&
                    entry.collectionId === profile.collection.collectionId &&
                    entry.version === profile.collection.version,
            ),
    );
    if (!available.includes(CURRENT_PROFILE)) {
        throw new Error(
            `Exact official artifact is unavailable: ${CURRENT_PROFILE.manifest.providerId}@${CURRENT_PROFILE.manifest.version}`,
        );
    }
    const loaded = await Promise.all(
        available.map((profile) => loadOfficialProfile(providers, collections, manifestEntries, profile)),
    );
    const defaultProfile = loaded.find(({ profile }) => profile.version === CURRENT_PROFILE.version)?.profile;
    if (!defaultProfile) {
        throw new Error(`Official default profile is unavailable: ${CURRENT_PROFILE.id}@${CURRENT_PROFILE.version}`);
    }
    const contracts = new Map<string, ResolvedContract>();
    for (const artifacts of loaded) {
        for (const release of artifacts.contracts) {
            contracts.set(`${release.release.contractId}\0${release.release.version}`, release);
        }
    }
    return Object.freeze({
        profiles: Object.freeze(loaded.map(({ profile }) => profile)),
        defaultProfile,
        contracts: Object.freeze([...contracts.values()]),
    });
}

async function loadOfficialProfile(
    providers: ProviderRepositorySource,
    collections: CollectionRepositorySource,
    manifestEntries: readonly RepositoryArtifactEntry[],
    definition: ProfileDefinition,
): Promise<Readonly<{ profile: OfficialInstanceProfile; contracts: readonly ResolvedContract[] }>> {
    const manifestEntry = exactEntry(manifestEntries, definition.manifest.providerId, definition.manifest.version);
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
        implementationAdmissions.map((admission) => resolveContract(catalogue, admission)),
    );
    const manifest = await admitProviderManifestJson(manifestBytes, catalogue);
    if (manifest.digest !== manifestEntry.digest) {
        throw new Error(
            `Official Provider manifest digest mismatch: ${manifest.manifest.providerId}@${manifest.manifest.version}`,
        );
    }
    const collectionEntry = (await collections.list()).find(
        (entry) =>
            entry.publisherId === definition.collection.publisherId &&
            entry.collectionId === definition.collection.collectionId &&
            entry.version === definition.collection.version,
    );
    if (!collectionEntry) {
        throw new Error(
            `Exact official artifact is unavailable: ${definition.collection.collectionId}@${definition.collection.version}`,
        );
    }
    const collectionBundle = await collections.get(collectionEntry);
    const collection = await admitCollectionRelease(collectionBundle.release, collectionBundle.assets, {
        contracts: catalogue,
    });
    if (collection.digest !== collectionEntry.digest) {
        throw new Error(
            `Official collection digest mismatch: ${definition.collection.collectionId}@${definition.collection.version}`,
        );
    }
    const profile: OfficialInstanceProfile = Object.freeze({
        initialPages,
        id: definition.id,
        version: definition.version,
        upgradeFromVersions: definition.upgradeFromVersions,
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
            candidate.publisherId === CURRENT_PROFILE.manifest.providerId &&
            candidate.id === id &&
            candidate.version === version,
    );
    if (!entry) {
        throw new Error(`Exact official artifact is unavailable: ${id}@${version}`);
    }
    return entry;
}

function hasEntry(entries: readonly RepositoryArtifactEntry[], id: string, version: string): boolean {
    return entries.some(
        (entry) =>
            entry.publisherId === CURRENT_PROFILE.manifest.providerId && entry.id === id && entry.version === version,
    );
}
