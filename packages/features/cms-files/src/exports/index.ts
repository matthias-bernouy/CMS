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
    CmsFilesMetadataRepository, FilesItem, FolderItem, FileItem, FilesItemType,
    FilesListOptions, FilesPage, NewFolder, NewFile, ItemPatch,
} from "cms-files/interfaces/CmsFilesMetadataRepository";
export type { CmsFilesBlobStore, BlobInput } from "cms-files/interfaces/CmsFilesBlobStore";

// ── Default implementations (memory + local FS; mongo/s3 under subpaths) ─
export { InMemoryCmsFilesMetadata }            from "cms-files/default-implementation/InMemoryCmsFilesMetadata";
export { InMemoryCmsFilesBlob }                from "cms-files/default-implementation/InMemoryCmsFilesBlob";
export { LocalFsCmsFilesBlob }                 from "cms-files/default-implementation/LocalFsCmsFilesBlob";
export { LocalFsCmsFiles, type ReconcileResult } from "cms-files/default-implementation/LocalFsCmsFiles";
export { ValidatingCmsFilesMetadata }            from "cms-files/core/ValidatingCmsFilesMetadata";

// ── Core ───────────────────────────────────────────────────────────────
export { sha256Hex } from "cms-files/core/hashBytes";
export { MAX_UPLOAD_BYTES, validateUploadSize, validateItemName, FileValidationError } from "cms-files/core/validation";

// ── File lifecycle (domain rules — create w/ rollback, in-place update, tree delete) ─
export { uploadFile }        from "cms-files/core/uploadFile";
export { updateFileContent } from "cms-files/core/updateFileContent";
export { deleteFileTree }    from "cms-files/core/deleteFileTree";

// ── Image variants (sharp — lazily imported at generation time) ────────
export {
    generateImageVariant, variantKey, manifestKey, readManifest, ensureVariants,
    type VariantFormat, type VariantSpec, type VariantManifest,
} from "cms-files/core/imageVariants";
export { OptimizeQueue } from "cms-files/core/optimizeQueue";
export { optimizePageImages, DEFAULT_LADDER, type OptimizeDeps } from "cms-files/core/optimizePageJob";

// ── HTTP (mountable by surfaces) ───────────────────────────────────────
export { serveVariantRequest, registerImageVariantEndpoint, type VariantServeDeps } from "cms-files/http/serveVariant";
export { serveFilesRequest, type FilesServeDeps } from "cms-files/http/serveFilesRequest";
export { registerFilesEndpoint }                  from "cms-files/http/registerFilesEndpoint";
