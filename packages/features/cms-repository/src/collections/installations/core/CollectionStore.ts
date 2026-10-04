import type { ReleaseCatalogue } from "../../../exports/contracts/catalogue";
import { admitCollectionRelease } from "../../core/admission/admitCollectionRelease";
import { parseCollectionTextOverrides } from "../../core/texts/parseCollectionTexts";
import type { CollectionBundleAsset } from "../../interfaces/CollectionAssets";
import type {
    CollectionInstallRequest,
    CollectionInstallation,
    CollectionMigrationReplacement,
    CollectionStorage,
    InstalledCollection,
    InstalledCollectionAssetMetadata,
} from "../interfaces/store";
import { installCollections } from "./mutations/install";
import { saveCollectionConfiguration, uninstallCollection } from "./mutations/site";
import { upgradeCollection } from "./mutations/upgrade";
import { assertCollectionResourceIsolation } from "./resourceIsolation";
import { validateStoredCollectionInstallation, writeCollectionSiteState } from "./siteState";
import { replaceCollectionsAfterMigration, restoreCollectionsAfterMigration } from "./mutations/migrate";

export class CollectionStore {
    constructor(
        private readonly storage: CollectionStorage,
        private readonly contracts?: ReleaseCatalogue,
    ) {}

    async importRelease(input: unknown, assets: readonly CollectionBundleAsset[] = []) {
        const artifact = await admitCollectionRelease(input, assets, { contracts: this.contracts });
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

    getReleaseAsset(digest: string, assetId: string): Promise<Uint8Array | null> {
        return this.storage.getAsset(digest, assetId);
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
                const artifact = await this.storage.getReleaseMetadata(installation.digest);
                if (!artifact || artifact.release.collectionId !== installation.collectionId) {
                    throw new Error("Installed collection artifact is missing or inconsistent");
                }
                validateStoredCollectionInstallation(installation, artifact.release);
                return { installation, release: artifact.release };
            }),
        );
        const results: InstalledCollectionAssetMetadata[] = [];
        for (const { installation, release } of releases) {
            for (const asset of release.assets) {
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

    async upgrade(siteId: string, digest: string, expectedRevision: number, repositoryId: string) {
        await upgradeCollection(this.storage, siteId, digest, expectedRevision, repositoryId);
        return this.snapshot(siteId);
    }

    async commitMigration(
        siteId: string,
        replacements: readonly CollectionMigrationReplacement[],
        expectedRevision: number,
    ) {
        await replaceCollectionsAfterMigration(this.storage, siteId, replacements, expectedRevision);
        return this.snapshot(siteId);
    }

    async restoreMigration(
        siteId: string,
        installations: readonly CollectionInstallation[],
        replacements: readonly CollectionMigrationReplacement[],
        expectedRevision: number,
    ) {
        await restoreCollectionsAfterMigration(this.storage, siteId, installations, replacements, expectedRevision);
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
