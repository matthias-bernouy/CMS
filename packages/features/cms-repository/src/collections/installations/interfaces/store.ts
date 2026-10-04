import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import type { CollectionTextOverrides } from "../../interfaces/CollectionText";

export type StoredCollectionAsset = { id: string; bytes: Uint8Array };
export type StoredCollectionRelease = {
    digest: string;
    release: CollectionRelease;
    assets: readonly StoredCollectionAsset[];
};
export type StoredCollectionReleaseMetadata = Omit<StoredCollectionRelease, "assets">;
export type CollectionInstallation = {
    collectionId: string;
    digest: string;
    repositoryId?: string;
    configuration: Readonly<Record<string, unknown>>;
    textOverrides: CollectionTextOverrides;
};
export type CollectionInstallRequest = { digest: string; repositoryId?: string };
export type CollectionMigrationReplacement = {
    collectionId: string;
    digest: string;
    repositoryId?: string;
    configuration: Readonly<Record<string, unknown>>;
    textOverrides: CollectionTextOverrides;
};
export type CollectionSiteState = { revision: number; installations: CollectionInstallation[] };
export type InstalledCollection = CollectionInstallation & { release: CollectionRelease };
export interface CollectionStorage {
    putRelease(artifact: StoredCollectionRelease): Promise<void>;
    getRelease(digest: string): Promise<StoredCollectionRelease | null>;
    getReleaseMetadata(digest: string): Promise<StoredCollectionReleaseMetadata | null>;
    getAsset(digest: string, assetId: string): Promise<Uint8Array | null>;
    readSite(siteId: string): Promise<CollectionSiteState>;
    compareAndSet(siteId: string, expected: number, next: CollectionSiteState): Promise<boolean>;
}
