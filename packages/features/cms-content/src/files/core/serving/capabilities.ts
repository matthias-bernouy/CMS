import type { OriginalBlobReader, SitemapStore, VariantStore } from "cms-content/files/interfaces/CmsFilesBlobStore";
import type { PublicFileMetadataLookup } from "cms-content/files/interfaces/CmsFilesMetadataRepository";

/** Fresh objects expose only serving capabilities, never an authoring store reference. */
export function createPublicFileMetadataLookup(store: PublicFileMetadataLookup): PublicFileMetadataLookup {
    return {
        getItem: async (id) => structuredClone(await store.getItem(id)),
        getItemByPath: async (path) => structuredClone(await store.getItemByPath(path)),
    };
}

export function createOriginalBlobReader(store: OriginalBlobReader): OriginalBlobReader {
    return { get: (key) => store.get(key) };
}

export function createVariantStore(store: VariantStore): VariantStore {
    return {
        get: (key) => store.get(key),
        put: (key, data) => store.put(key, data),
    };
}

export function createSitemapStore(store: SitemapStore): SitemapStore {
    return {
        get: (key) => store.get(key),
        put: (key, data) => store.put(key, data),
        delete: (key) => store.delete(key),
    };
}
