import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import type { CollectionTextOverrides } from "../../interfaces/CollectionText";

export type StoredCollectionRelease = { digest: string; release: CollectionRelease };
export type CollectionInstallation = {
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
    readSite(siteId: string): Promise<CollectionSiteState>;
    compareAndSet(siteId: string, expected: number, next: CollectionSiteState): Promise<boolean>;
}
