/**
 * @bernouy/cms-content/files — CMS media files.
 *
 * Authoring contracts, in-memory implementations, validation and lifecycle.
 * Serving and derivatives use /files/serving. Filesystem and network adapters
 * use /files/local-fs, /files/mongo and /files/s3 at composition roots only.
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

// ── In-memory implementations and validation ──────────────────────────
export { InMemoryCmsFilesMetadata } from "cms-content/files/default-implementation/memory/InMemoryCmsFilesMetadata";
export { InMemoryCmsFilesBlob } from "cms-content/files/default-implementation/memory/InMemoryCmsFilesBlob";

export { ValidatingCmsFilesMetadata } from "cms-content/files/core/validation/ValidatingCmsFilesMetadata";

// ── Core ───────────────────────────────────────────────────────────────
export { sha256Hex } from "cms-content/files/core/media/hashBytes";
export {
    MAX_UPLOAD_BYTES,
    validateUploadSize,
    validateItemName,
    FileValidationError,
} from "cms-content/files/core/validation/validation";

// ── File lifecycle (domain rules — create w/ rollback, in-place update, tree delete) ─
export { uploadFile } from "cms-content/files/core/lifecycle/uploadFile";
export { updateFileContent } from "cms-content/files/core/lifecycle/updateFileContent";
export { deleteFileTree } from "cms-content/files/core/lifecycle/deleteFileTree";
