import { LocalFsBlobStore } from "@bernouy/blob-store/local-fs";
import type { BlobReader } from "@bernouy/blob-store";
import {
    createOriginalBlobReader,
    createPublicFileMetadataLookup,
    createSitemapStore,
    createVariantStore,
    type PublicFileMetadataLookup,
    type SitemapStore,
    type VariantStore,
} from "@bernouy/cms-content/files/serving";
import { join } from "node:path";

/** Flat-key stores keep derivative writes and retention in their existing subdirectories. */
export function createLocalAuthorFileStores(directory: string) {
    return {
        filesBlob: new LocalFsBlobStore(directory),
        variantStore: new LocalFsBlobStore(join(directory, ".variants")),
        sitemapStore: new LocalFsBlobStore(join(directory, ".sitemaps")),
    };
}

export function createPublicFileStores(stores: {
    filesMetadata: PublicFileMetadataLookup;
    filesBlob: BlobReader;
    variantStore: VariantStore;
    sitemapStore: SitemapStore;
}) {
    return {
        filesMetadata: createPublicFileMetadataLookup(stores.filesMetadata),
        filesBlob: createOriginalBlobReader(stores.filesBlob),
        variantStore: createVariantStore(stores.variantStore),
        sitemapStore: createSitemapStore(stores.sitemapStore),
    };
}
