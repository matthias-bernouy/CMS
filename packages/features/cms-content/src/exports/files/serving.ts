/** Public library lookups and derivative work, without authoring or storage adapters. */
export type { VariantStore, SitemapStore } from "cms-content/files/interfaces/CmsFileStores";
export type {
    PublicFileMetadataLookup,
    FileItem,
    FolderItem,
    FilesItem,
} from "cms-content/files/interfaces/CmsFilesMetadataRepository";
export {
    createPublicFileMetadataLookup,
    createOriginalBlobReader,
    createVariantStore,
    createSitemapStore,
} from "cms-content/files/core/serving/capabilities";
export {
    generateImageVariant,
    variantKey,
    manifestKey,
    readManifest,
    ensureVariants,
    type VariantFormat,
    type VariantSpec,
    type VariantManifest,
} from "cms-content/files/core/media/imageVariants";
export { OptimizeQueue } from "cms-content/files/core/optimization/optimizeQueue";
export {
    optimizePageImages,
    DEFAULT_LADDER,
    type OptimizeDeps,
} from "cms-content/files/core/optimization/optimizePageJob";
export { injectMediaVersions } from "cms-content/files/core/media/injectMediaVersions";
export { serveVariantRequest, type VariantServeDeps } from "cms-content/files/http/serveVariant";
export { isInlineSafeFileType, serveFilesRequest, type FilesServeDeps } from "cms-content/files/http/serveFilesRequest";
export * from "cms-content/exports/files/urls";
