/**
 * @bernouy/cms-content/files — CMS media files.
 *
 * Authoring contracts, metadata implementations, validation and lifecycle.
 * Serving and derivatives use /files/serving. Generic byte stores come from
 * @bernouy/blob-store; CMS metadata adapters use /files/local-fs and /files/mongo.
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
// ── In-memory implementations and validation ──────────────────────────
export { InMemoryCmsFilesMetadata } from "cms-content/files/default-implementation/memory/InMemoryCmsFilesMetadata";
export { ValidatingCmsFilesMetadata } from "cms-content/files/core/validation/ValidatingCmsFilesMetadata";

// ── Core ───────────────────────────────────────────────────────────────
export {
    MAX_UPLOAD_BYTES,
    validateContentHash,
    validateUploadSize,
    validateItemName,
    FileValidationError,
} from "cms-content/files/core/validation/validation";

// ── File lifecycle (domain rules — create w/ rollback, in-place update, tree delete) ─
export { uploadFile } from "cms-content/files/core/lifecycle/uploadFile";
export { updateFileContent } from "cms-content/files/core/lifecycle/updateFileContent";
export { deleteFileTree } from "cms-content/files/core/lifecycle/deleteFileTree";
