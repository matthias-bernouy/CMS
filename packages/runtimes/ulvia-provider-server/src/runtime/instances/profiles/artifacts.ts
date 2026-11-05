import { resourcePublisher } from "@bernouy/cms-repository/contracts/protocol";
import { loadDocumentedContract } from "@bernouy/cms-repository/providers/sources";
import { CURRENT_PROFILE, REPOSITORY_PROFILE, SUPPORTED_PROFILES, type ProfileDefinition } from "./definitions";
import { repositoryPages } from "./repositoryPages";
import { initialPages } from "./initialPages";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import type { CollectionRepositorySource } from "@bernouy/cms-repository/collections/sources";
import { type AdmittedContractRelease, type ResolvedContract } from "@bernouy/cms-repository/contracts";
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
    const manifestEntries = await providers.list("provider-manifest");
    const loaded = await Promise.all(
        SUPPORTED_PROFILES.map((profile) => loadOfficialProfile(providers, collections, manifestEntries, profile)),
    );
    const defaultProfile = loaded.find(
        ({ profile }) => profile.id === CURRENT_PROFILE.id && profile.version === CURRENT_PROFILE.version,
    )?.profile;
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
    const collectionEntries = await collections.list();
    const collectionPins = [];
    for (const pin of definition.collections) {
        const entry = collectionEntries.find(
            (entry) =>
                entry.publisherId === pin.publisherId &&
                entry.collectionId === pin.collectionId &&
                entry.version === pin.version,
        );
        if (!entry) {
            throw new Error(`Exact official artifact is unavailable: ${pin.collectionId}@${pin.version}`);
        }
        const bundle = await collections.get(entry);
        const collection = await admitCollectionRelease(bundle.release, bundle.assets, { contracts: catalogue });
        if (collection.digest !== entry.digest) {
            throw new Error(`Official collection digest mismatch: ${pin.collectionId}@${pin.version}`);
        }
        collectionPins.push(Object.freeze({ ...pin, digest: collection.digest }));
    }
    const profile: OfficialInstanceProfile = Object.freeze({
        initialPages:
            definition.id === REPOSITORY_PROFILE.id
                ? [...initialPages.filter(({ id }) => id !== "login"), ...repositoryPages]
                : initialPages,
        id: definition.id,
        version: definition.version,
        upgradeFromVersions: definition.upgradeFromVersions,
        manifest: Object.freeze({
            providerId: manifest.manifest.providerId,
            version: manifest.manifest.version,
            digest: manifest.digest,
        }),
        contracts: Object.freeze(
            implementationAdmissions
                .filter(
                    ({ release }) =>
                        definition.id === REPOSITORY_PROFILE.id || release.contractId !== "ulvia/repository",
                )
                .map(({ digest, release }) =>
                    Object.freeze({ contractId: release.contractId, version: release.version, digest }),
                ),
        ),
        collections: Object.freeze(collectionPins),
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
            candidate.publisherId === resourcePublisher(id) && candidate.id === id && candidate.version === version,
    );
    if (!entry) {
        throw new Error(`Exact official artifact is unavailable: ${id}@${version}`);
    }
    return entry;
}
