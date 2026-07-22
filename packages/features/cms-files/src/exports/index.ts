/**
 * @bernouy/cms-files — CMS media files.
 *
 * Root export = the metadata + blob contracts, the dependency-free
 * implementations (in-memory, local FS), content hashing, and the
 * mountable serving handlers. Network adapters live under
 * `@bernouy/cms-files/mongo` and `@bernouy/cms-files/s3` — composition
 * roots only.
 */

// ── Interfaces ─────────────────────────────────────────────────────────
export type {
    CmsFilesMetadataRepository,
    FilesItem,
    FolderItem,
    FileItem,
    FilesItemType,
    FilesListOptions,
    FilesPage,
    NewFolder,
    NewFile,
    ItemPatch,
} from "cms-files/interfaces/CmsFilesMetadataRepository";
export type { CmsFilesBlobStore, BlobInput } from "cms-files/interfaces/CmsFilesBlobStore";

// ── Default implementations (memory + local FS; mongo/s3 under subpaths) ─
export { InMemoryCmsFilesMetadata } from "cms-files/default-implementation/memory/InMemoryCmsFilesMetadata";
export { InMemoryCmsFilesBlob } from "cms-files/default-implementation/memory/InMemoryCmsFilesBlob";
export { LocalFsCmsFilesBlob } from "cms-files/default-implementation/local-fs/LocalFsCmsFilesBlob";
export {
    CMS_FILES_REGISTRY_NAME,
    LocalFsCmsFiles,
    type ReconcileOptions,
    type ReconcileResult,
} from "cms-files/default-implementation/local-fs/LocalFsCmsFiles";
export { ValidatingCmsFilesMetadata } from "cms-files/core/validation/ValidatingCmsFilesMetadata";

// ── Core ───────────────────────────────────────────────────────────────
export { sha256Hex } from "cms-files/core/media/hashBytes";
export {
    MAX_UPLOAD_BYTES,
    validateUploadSize,
    validateItemName,
    FileValidationError,
} from "cms-files/core/validation/validation";
export {
    CMS_FILES_ROUTE,
    CMS_FILES_BY_ID_SEGMENT,
    CMS_FILES_BY_ID_ROUTE,
    CMS_IMAGE_VARIANT_ROUTE,
    filesPrefix,
    imageVariantPrefix,
    cmsFilesByIdPath,
    cmsFilesByIdUrl,
    cmsImageVariantPath,
    cmsImageVariantUrl,
    cmsImageVariantUrlFromByIdUrl,
    cmsFilesByIdRef,
    isCmsFilesByIdUrl,
    mediaIdFromUrl,
    parseCmsFilesByIdUrl,
    withFileVersion,
    type CmsFilesByIdUrl,
} from "cms-files/core/media/fileUrls";

// ── File lifecycle (domain rules — create w/ rollback, in-place update, tree delete) ─
export { uploadFile } from "cms-files/core/lifecycle/uploadFile";
export { updateFileContent } from "cms-files/core/lifecycle/updateFileContent";
export { deleteFileTree } from "cms-files/core/lifecycle/deleteFileTree";

// ── Image variants (sharp — lazily imported at generation time) ────────
export {
    generateImageVariant,
    variantKey,
    manifestKey,
    readManifest,
    ensureVariants,
    type VariantFormat,
    type VariantSpec,
    type VariantManifest,
} from "cms-files/core/media/imageVariants";
export { OptimizeQueue } from "cms-files/core/optimization/optimizeQueue";
export {
    optimizePageImages,
    DEFAULT_LADDER,
    type OptimizeDeps,
} from "cms-files/core/optimization/optimizePageJob";
export { injectMediaVersions } from "cms-files/core/media/injectMediaVersions";

// ── HTTP handlers (mounted by surfaces) ────────────────────────────────
export { serveVariantRequest, type VariantServeDeps } from "cms-files/http/serveVariant";
export { serveFilesRequest, type FilesServeDeps } from "cms-files/http/serveFilesRequest";
