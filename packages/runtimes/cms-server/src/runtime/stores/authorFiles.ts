import { LocalFsCmsFilesBlob } from "@bernouy/cms-content/files/local-fs";
import {
    createOriginalBlobReader,
    createPublicFileMetadataLookup,
    createSitemapStore,
    createVariantStore,
    type BlobReader,
    type PublicFileMetadataLookup,
    type SitemapStore,
    type VariantStore,
} from "@bernouy/cms-content/files/serving";
import { join } from "node:path";

/** Flat-key stores keep derivative writes and retention in their existing subdirectories. */
export function createLocalAuthorFileStores(directory: string) {
    return {
        filesBlob: new LocalFsCmsFilesBlob(directory),
        variantStore: new LocalFsCmsFilesBlob(join(directory, ".variants")),
        sitemapStore: new LocalFsCmsFilesBlob(join(directory, ".sitemaps")),
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
