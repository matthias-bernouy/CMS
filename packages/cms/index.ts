/**
 * @bernouy/cms — public entry point.
 *
 * Consumers import from `@bernouy/cms` and get the `Cms` class plus the
 * in-memory cache provider. Host apps wire their own `Be5_Runner` +
 * `Authentication` (from `@bernouy/socle`) and a `CmsRepository` of their
 * choice (the bundled `CmsRepositoryInMemory` is the canonical one until a
 * persistent provider is re-added).
 */

// ── Core ────────────────────────────────────────────────────────────────
export { ControlCms as Cms } from "./src/control/ControlCms";

// ── Delivery (public-facing rendering) ─────────────────────────────────
export { default as DeliveryCms } from "./src/delivery/DeliveryCms";
export { DeliveryCache } from "./src/delivery/core/DeliveryCache";
export { registerDeliveryEndpoints } from "./src/delivery/registerDeliveryEndpoints";
export type { DeliveryRepository } from "./src/delivery/interfaces/DeliveryRepository";
export type { DeliveryCmsConfig } from "./src/delivery/DeliveryCms";
export type { HeadInjector, HeadInjectorContext } from "./src/delivery/interfaces/HeadInjector";

// ── Default providers ──────────────────────────────────────────────────
export { InMemoryCmsRepository } from "./src/socle/default-implementation/CmsRepository/memory";
export { MongoCmsRepository } from "./src/socle/default-implementation/CmsRepository/mongodb";
export { InMemoryCmsFilesMetadata } from "./src/socle/default-implementation/CmsFilesMetadata/memory";
export { MongoCmsFilesMetadata, type MongoCmsFilesMetadataConfig } from "./src/socle/default-implementation/CmsFilesMetadata/mongodb";
export type {
    CmsFilesMetadataRepository, FilesItem, FolderItem, FileItem, FilesItemType,
    FilesListOptions, FilesPage, NewFolder, NewFile, ItemPatch,
} from "./src/socle/interfaces/CmsFilesMetadataRepository";
export { InMemoryCmsFilesBlob } from "./src/socle/default-implementation/CmsFilesBlob/memory";
export { LocalFsCmsFilesBlob } from "./src/socle/default-implementation/CmsFilesBlob/localFs";
export { S3CmsFilesBlob, type S3CmsFilesBlobConfig } from "./src/socle/default-implementation/CmsFilesBlob/s3";
export type { CmsFilesBlobStore, BlobInput } from "./src/socle/interfaces/CmsFilesBlobStore";
export { LocalFsCmsFiles } from "./src/socle/default-implementation/CmsFiles/localFs";
export { InMemoryCache } from "./src/socle/default-implementation/Cache/memory";
export { InMemorySecretStore } from "./src/socle/default-implementation/SecretStore/memory";
export { EncryptedMongoSecretStore, type EncryptedSecretDocument, type EncryptedMongoSecretStoreConfig } from "./src/socle/default-implementation/SecretStore/encryptedMongo";
// Auth backbone (CMS-side authN + authZ + identity providers + PATs) lives
// in `@bernouy/auth-core` — consumers import from there, not from this barrel.
// The DEK repository (`MongoDekRepository`) used by `EncryptedMongoSecretStore`
// is also there, since envelope encryption is shared with `PiiCrypto`.

// Browser-safe bloc authoring symbols are deliberately split into two
// sub-entries:
//   • `@bernouy/cms/component` — exposes only `Component`.
//     Imported by `Bloc.ts` and included in the view bundle visitors download.
//   • `@bernouy/cms/editor`    — exposes `Editor`, `registerEditor`,
//     `registerEditor_opaque`. Imported by `BlocEditor.ts` and included in
//     the editor bundle that only the admin loads.
// Keeping the two entries isolated guarantees the view bundle never drags
// editor-side code (ObserverManager, ConfigPanel, …) into what visitors see.
// Neither entry is re-exported from this barrel — importing them alongside
// `Cms` would force consumers to pull the whole MongoDB runtime into
// every browser bundle.

// ── Contracts (for consumers who want to swap in a custom backend) ─────
export type { CmsRepository } from "./src/socle/interfaces/CmsRepository";
export type { Cache } from "./src/socle/interfaces/Cache";
export type { SecretStore } from "./src/socle/interfaces/SecretStore";
export type { CMS_ROLES } from "./types/roles";
export type {
    TPage,
    TBloc,
    TTemplate,
    TSnippet,
    TSystem,
} from "./src/socle/interfaces/models";

// ── Seeding CLI (importable for programmatic use) ──────────────────────
export { default as importBlocs } from "./src/cli/CLI_importBloc";
