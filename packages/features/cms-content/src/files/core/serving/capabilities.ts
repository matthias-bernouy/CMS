import type { BlobReader } from "@bernouy/blob-store";
import type { SitemapStore, VariantStore } from "cms-content/files/interfaces/CmsFileStores";
import type { PublicFileMetadataLookup } from "cms-content/files/interfaces/CmsFilesMetadataRepository";

/** Fresh objects expose only serving capabilities, never an authoring store reference. */
export function createPublicFileMetadataLookup(store: PublicFileMetadataLookup): PublicFileMetadataLookup {
    return {
        getItem: async (id) => structuredClone(await store.getItem(id)),
        getItemByPath: async (path) => structuredClone(await store.getItemByPath(path)),
    };
}

export function createOriginalBlobReader(store: BlobReader): BlobReader {
    return { get: (key, options) => store.get(key, options), head: (key) => store.head(key) };
}

export function createVariantStore(store: VariantStore): VariantStore {
    return {
        get: (key, options) => store.get(key, options),
        head: (key) => store.head(key),
        put: (key, data) => store.put(key, data),
    };
}

export function createSitemapStore(store: SitemapStore): SitemapStore {
    return {
        get: (key, options) => store.get(key, options),
        head: (key) => store.head(key),
        put: (key, data) => store.put(key, data),
        delete: (key) => store.delete(key),
    };
}
