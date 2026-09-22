/**
 * @bernouy/cms-content/files — CMS media files.
 *
 * Files export = the metadata + blob contracts, the dependency-free
 * implementations (in-memory, local FS), content hashing, and the
 * mountable serving handlers. Network adapters live under
 * `@bernouy/cms-content/files/mongo` and `@bernouy/cms-content/files/s3` — composition
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
} from "cms-content/files/interfaces/CmsFilesMetadataRepository";
export type { CmsFilesBlobStore, BlobInput } from "cms-content/files/interfaces/CmsFilesBlobStore";

// ── Default implementations (memory + local FS; mongo/s3 under subpaths) ─
export { InMemoryCmsFilesMetadata } from "cms-content/files/default-implementation/memory/InMemoryCmsFilesMetadata";
export { InMemoryCmsFilesBlob } from "cms-content/files/default-implementation/memory/InMemoryCmsFilesBlob";
export { LocalFsCmsFilesBlob } from "cms-content/files/default-implementation/local-fs/LocalFsCmsFilesBlob";
export {
    CMS_FILES_REGISTRY_NAME,
    LocalFsCmsFiles,
    type ReconcileOptions,
    type ReconcileResult,
} from "cms-content/files/default-implementation/local-fs/LocalFsCmsFiles";
export { ValidatingCmsFilesMetadata } from "cms-content/files/core/validation/ValidatingCmsFilesMetadata";

// ── Core ───────────────────────────────────────────────────────────────
export { sha256Hex } from "cms-content/files/core/media/hashBytes";
export {
    MAX_UPLOAD_BYTES,
    validateUploadSize,
    validateItemName,
    FileValidationError,
} from "cms-content/files/core/validation/validation";
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
} from "cms-content/files/core/media/fileUrls";

// ── File lifecycle (domain rules — create w/ rollback, in-place update, tree delete) ─
export { uploadFile } from "cms-content/files/core/lifecycle/uploadFile";
export { updateFileContent } from "cms-content/files/core/lifecycle/updateFileContent";
export { deleteFileTree } from "cms-content/files/core/lifecycle/deleteFileTree";

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
} from "cms-content/files/core/media/imageVariants";
export { OptimizeQueue } from "cms-content/files/core/optimization/optimizeQueue";
export {
    optimizePageImages,
    DEFAULT_LADDER,
    type OptimizeDeps,
} from "cms-content/files/core/optimization/optimizePageJob";
export { injectMediaVersions } from "cms-content/files/core/media/injectMediaVersions";

// ── HTTP handlers (mounted by surfaces) ────────────────────────────────
export { serveVariantRequest, type VariantServeDeps } from "cms-content/files/http/serveVariant";
export {
    isInlineSafeFileType,
    serveFilesRequest,
    type FilesServeDeps,
} from "cms-content/files/http/serveFilesRequest";
