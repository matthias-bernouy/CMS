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

// ── Core ───────────────────────────────────────────────────────────────
export { sha256Hex } from "cms-files/core/hashBytes";

// ── HTTP (mountable by surfaces) ───────────────────────────────────────
export { serveFilesRequest, type FilesServeDeps } from "cms-files/http/serveFilesRequest";
export { registerFilesEndpoint }                  from "cms-files/http/registerFilesEndpoint";
