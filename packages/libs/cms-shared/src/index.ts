/**
 * @bernouy/cms-shared — CMS-domain primitives shared between `cms-control`,
 * `cms-delivery`, and `cms-cli`.
 *
 * Holds the persistence contracts (CmsRepository, CmsFilesMetadataRepository,
 * CmsFilesBlobStore, Cache, KVStore, SecretStore) + their in-memory / Mongo /
 * local-FS / S3 implementations, the bloc compile pipeline used by the admin
 * `bloc.post.ts` and the dev CLI (`prepare_bloc`, `validateBloc`,
 * `p9rExternalsPlugin`), the HTTP serving helpers (compression, CSP), the
 * p9r-* constants, and the `CMS_ROLES` membership.
 */

// ── Domain roles ───────────────────────────────────────────────────────
export type CMS_ROLES = "admin" | "user";

// ── Content interfaces ─────────────────────────────────────────────────
export type {
    CmsRepository, BlocListItemResponse, PageLink, PageMeta, PagesQuery,
} from "cms-shared/interfaces/CmsRepository";
export { filterAndSortPages } from "cms-shared/default-implementation/CmsRepository/pagesQuery";
export type {
    TPage, TBloc, TTemplate, TSnippet, TSystem, TPageRef,
} from "cms-shared/interfaces/models";
export type { Cache, CacheEntry } from "cms-shared/interfaces/Cache";
export type { SecretStore }       from "cms-shared/interfaces/SecretStore";
export type {
    CmsFilesMetadataRepository, FilesItem, FolderItem, FileItem, FilesItemType,
    FilesListOptions, FilesPage, NewFolder, NewFile, ItemPatch,
} from "cms-shared/interfaces/CmsFilesMetadataRepository";
export type { CmsFilesBlobStore, BlobInput } from "cms-shared/interfaces/CmsFilesBlobStore";

// ── Default implementations ────────────────────────────────────────────
export { InMemoryCmsRepository } from "cms-shared/default-implementation/CmsRepository/memory";
export { MongoCmsRepository }    from "cms-shared/default-implementation/CmsRepository/mongodb";

export { InMemoryCmsFilesMetadata } from "cms-shared/default-implementation/CmsFilesMetadata/memory";
export { MongoCmsFilesMetadata, type MongoCmsFilesMetadataConfig } from "cms-shared/default-implementation/CmsFilesMetadata/mongodb";

export { InMemoryCmsFilesBlob } from "cms-shared/default-implementation/CmsFilesBlob/memory";
export { LocalFsCmsFilesBlob }  from "cms-shared/default-implementation/CmsFilesBlob/localFs";
export { S3CmsFilesBlob, type S3CmsFilesBlobConfig } from "cms-shared/default-implementation/CmsFilesBlob/s3";

export { LocalFsCmsFiles } from "cms-shared/default-implementation/CmsFiles/localFs";
export { InMemoryCache }   from "cms-shared/default-implementation/Cache/memory";

export { InMemorySecretStore } from "cms-shared/default-implementation/SecretStore/memory";
export {
    EncryptedMongoSecretStore,
    type EncryptedSecretDocument, type EncryptedMongoSecretStoreConfig,
} from "cms-shared/default-implementation/SecretStore/encryptedMongo";

// ── Bloc compile pipeline ──────────────────────────────────────────────
export { prepare_bloc }                  from "cms-shared/blocs/prepare_bloc";
export { validateBloc, validateBlocTag } from "cms-shared/blocs/validateBloc";
export { p9rExternalsPlugin }            from "cms-shared/blocs/p9rExternalsPlugin";

// ── Server helpers ─────────────────────────────────────────────────────
export * from "cms-shared/server/compression";
export {
    buildCspContent, type CspExtras,
} from "cms-shared/server/buildCspContent";
export {
    serveFilesRequest, type FilesServeDeps,
} from "cms-shared/server/serveFilesRequest";
export { registerFilesEndpoint } from "cms-shared/server/registerFilesEndpoint";
export { registerStyleEndpoint } from "cms-shared/server/registerStyleEndpoint";

// ── Files utils ────────────────────────────────────────────────────────
export { pathOf } from "cms-shared/files/pathOf";

// ── Constants ──────────────────────────────────────────────────────────
export * from "cms-shared/constants/p9r-constants";
export * from "cms-shared/constants/editorAttributes";

// ── Utils ──────────────────────────────────────────────────────────────
export * from "cms-shared/utils/validation";
export * from "cms-shared/utils/contentRefs";
export { escapeHtml } from "cms-shared/utils/escapeHtml";
export { sanitizeDomTree } from "cms-shared/utils/sanitizeDomTree";
