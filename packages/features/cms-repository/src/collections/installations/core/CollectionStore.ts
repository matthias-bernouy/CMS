import { verifyCollectionRequirements } from "../../core/admission/requirements";
import { listInstalledCollections, readInstalledCollection } from "./installedCatalogue";
import { assertUpgradePermit, type CollectionUpgradePermit } from "../upgrades/runtime/permit";
import type { ReleaseCatalogue } from "../../../exports/contracts/catalogue";
import type { BlobRange } from "@bernouy/blob-store";
import { admitCollectionRelease } from "../../core/admission/admitCollectionRelease";
import { parseCollectionTextOverrides } from "../../core/texts/parseCollectionTexts";
import type { CollectionBundleAsset } from "../../interfaces/CollectionAssets";
import type { AdmittedCollectionRelease } from "../../interfaces/CollectionAdmission";
import type {
    CollectionInstallRequest,
    CollectionUpgradeReplacement,
    CollectionStorage,
    InstalledCollection,
    InstalledCollectionAssetMetadata,
} from "../interfaces/store";
import { installCollections } from "./mutations/install";
import { saveCollectionConfiguration, uninstallCollection } from "./mutations/site";
import { assertCollectionResourceIsolation } from "./resourceIsolation";
import { validateStoredCollectionInstallation, writeCollectionSiteState } from "./siteState";
import { replaceCollectionsForUpgrade } from "./mutations/switch";

export class CollectionStore {
    constructor(
        private readonly storage: CollectionStorage,
        private readonly contracts?: ReleaseCatalogue,
    ) {}

    async importRelease(input: unknown, assets: readonly CollectionBundleAsset[] = []) {
        const artifact = await admitCollectionRelease(input, assets, { contracts: this.contracts });
        return this.importAdmittedRelease(artifact);
    }

    /** Fully validates and snapshots a bundle without making it durable. */
    admitRelease(input: unknown, assets: readonly CollectionBundleAsset[] = []): Promise<AdmittedCollectionRelease> {
        return admitCollectionRelease(input, assets, { contracts: this.contracts });
    }

    validateReleaseRequirements(artifact: AdmittedCollectionRelease): Promise<void> {
        return verifyCollectionRequirements(artifact.release, this.contracts);
    }

    /** Persists the exact immutable artifact previously returned by `admitRelease`. */
    async importAdmittedRelease(artifact: AdmittedCollectionRelease) {
        const release = artifact.release;
        const storedAssets = await Promise.all(
            artifact.assets.map(async ({ id, bytes }) => ({
                id,
                bytes: new Uint8Array(await bytes.arrayBuffer()),
            })),
        );
        await this.storage.putRelease({ digest: artifact.digest, release, assets: storedAssets });
        return { digest: artifact.digest, release };
    }

    getReleaseAsset(digest: string, assetId: string, range?: BlobRange): Promise<Uint8Array | null> {
        return this.storage.getAsset(digest, assetId, range);
    }

    /** Resolves one installed asset without hydrating every installed collection release. */
    async getInstalledAssetMetadata(siteId: string, collectionId: string, assetId: string) {
        return (await this.getInstalledAssetMetadataBatch(siteId, [{ collectionId, assetId }]))[0] ?? null;
    }

    /** Resolves a unique asset set with one site read and only the referenced release metadata. */
    async getInstalledAssetMetadataBatch(
        siteId: string,
        references: readonly { collectionId: string; assetId: string }[],
    ): Promise<InstalledCollectionAssetMetadata[]> {
        const requested = new Map(
            references.map((reference) => [`${reference.collectionId}\0${reference.assetId}`, reference]),
        );
        if (requested.size === 0) {
            return [];
        }
        const state = await this.storage.readSite(siteId);
        const collectionIds = new Set([...requested.values()].map(({ collectionId }) => collectionId));
        const installations = state.installations.filter(({ collectionId }) => collectionIds.has(collectionId));
        const releases = await Promise.all(
            installations.map(async (installation) => {
                const manifest = await this.storage.getAssetManifest(installation.digest);
                if (!manifest || manifest.collectionId !== installation.collectionId) {
                    throw new Error("Installed collection artifact is missing or inconsistent");
                }
                return { installation, manifest };
            }),
        );
        const results: InstalledCollectionAssetMetadata[] = [];
        for (const { installation, manifest } of releases) {
            for (const asset of manifest.assets) {
                if (requested.has(`${installation.collectionId}\0${asset.id}`)) {
                    results.push({ collectionId: installation.collectionId, digest: installation.digest, asset });
                }
            }
        }
        return structuredClone(results);
    }

    async getRelease(digest: string) {
        return structuredClone(await this.storage.getReleaseMetadata(digest));
    }

    async revision(siteId: string): Promise<number> {
        return (await this.storage.readSite(siteId)).revision;
    }

    listInstalled(siteId: string) {
        return listInstalledCollections(this.storage, siteId);
    }

    readInstalled(siteId: string, collectionId: string) {
        return readInstalledCollection(this.storage, siteId, collectionId);
    }

    async snapshot(siteId: string): Promise<{ revision: number; collections: InstalledCollection[] }> {
        const state = await this.storage.readSite(siteId);
        const collections = await Promise.all(
            state.installations.map(async (installation) => {
                const artifact = await this.storage.getReleaseMetadata(installation.digest);
                if (!artifact || artifact.release.collectionId !== installation.collectionId) {
                    throw new Error("Installed collection artifact is missing or inconsistent");
                }
                return {
                    ...validateStoredCollectionInstallation(installation, artifact.release),
                    release: artifact.release,
                };
            }),
        );
        assertCollectionResourceIsolation(collections.map(({ release }) => release));
        return structuredClone({ revision: state.revision, collections });
    }

    async install(siteId: string, digest: string, expectedRevision: number, repositoryId?: string) {
        return this.installMany(siteId, [{ digest, ...(repositoryId ? { repositoryId } : {}) }], expectedRevision);
    }

    /** Install one exact dependency graph atomically; request order is irrelevant. */
    async installMany(siteId: string, requests: readonly CollectionInstallRequest[], expectedRevision: number) {
        await installCollections(this.storage, siteId, requests, expectedRevision);
        return this.snapshot(siteId);
    }

    async commitUpgrade(
        siteId: string,
        replacements: readonly CollectionUpgradeReplacement[],
        expectedRevision: number,
        permit: CollectionUpgradePermit,
    ) {
        await assertUpgradePermit(permit, siteId, expectedRevision, replacements);
        await replaceCollectionsForUpgrade(this.storage, siteId, replacements, expectedRevision);
        return this.snapshot(siteId);
    }

    async saveConfiguration(siteId: string, collectionId: string, expectedRevision: number, value: unknown) {
        await saveCollectionConfiguration(this.storage, siteId, collectionId, expectedRevision, value);
        return this.snapshot(siteId);
    }

    async uninstall(siteId: string, collectionId: string, expectedRevision: number) {
        await uninstallCollection(this.storage, siteId, collectionId, expectedRevision);
        return this.snapshot(siteId);
    }

    async saveTexts(siteId: string, collectionId: string, expectedRevision: number, overrides: unknown) {
        const state = await this.storage.readSite(siteId);
        const installation = state.installations.find((item) => item.collectionId === collectionId);
        if (!installation) {
            throw Object.assign(new Error("Collection is not installed"), { status: 404 });
        }
        const artifact = await this.storage.getReleaseMetadata(installation.digest);
        if (!artifact) {
            throw new Error("Missing release");
        }
        if (JSON.stringify(overrides)?.length > 1024 * 1024) {
            throw new TypeError("Text overrides exceed their aggregate bound");
        }
        const textOverrides = parseCollectionTextOverrides(overrides, artifact.release.texts ?? []);
        const next = {
            revision: expectedRevision + 1,
            installations: state.installations.map((item) =>
                item.collectionId === collectionId ? { ...item, textOverrides } : item,
            ),
        };
        await writeCollectionSiteState(this.storage, siteId, state.revision, expectedRevision, next);
        return this.snapshot(siteId);
    }
}
