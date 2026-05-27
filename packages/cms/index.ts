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

// ── Delivery (public-facing rendering, deployable alone) ───────────────
export { default as DeliveryCms } from "./src/delivery/DeliveryCms";
export { DeliveryCache } from "./src/delivery/core/DeliveryCache";
export { PlaywrightSession } from "./src/delivery/core/enhance/PlaywrightSession";
export { registerDeliveryEndpoints } from "./src/delivery/registerDeliveryEndpoints";
export type { DeliveryRepository } from "./src/delivery/interfaces/DeliveryRepository";
export type { DeliveryCmsConfig } from "./src/delivery/DeliveryCms";
export type { HeadInjector, HeadInjectorContext } from "./src/delivery/interfaces/HeadInjector";

// ── Build pipeline (used by the multi-tenant Delivery cron) ────────────
export { DeliveryBuilder }      from "./src/delivery/build/DeliveryBuilder";
export type { DeliveryBuilderDeps, RunOnceResult } from "./src/delivery/build/DeliveryBuilder";
export { BuildEnhancer }        from "./src/delivery/build/BuildEnhancer";
export { HttpVariantGenerator } from "./src/delivery/build/HttpVariantGenerator";
export { pageBucketName, pagePublicPath } from "./src/delivery/build/pathSlug";

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
export { MongoDekRepository, type CmsDekDocument } from "./src/socle/default-implementation/MongoDekRepository";

// ── Users, authorization & identity (CMS-side authn/authz) ─────────────
export { InMemoryUsersRepository } from "./src/socle/default-implementation/UsersRepository/memory";
export { MongoUsersRepository, type MongoUsersConfig } from "./src/socle/default-implementation/UsersRepository/mongodb";
export type { UsersRepository, Identity, TUser, UsersListOptions, UsersPage } from "./src/socle/interfaces/UsersRepository";
export { SubjectResolver, internalUserId } from "./src/socle/auth/SubjectResolver";
export { PiiCrypto, createPiiCrypto } from "./src/socle/auth/PiiCrypto";
export { LocalAuthentication, type LocalAuthConfig } from "./src/socle/auth/LocalAuthentication";
export { OidcAuthentication, type OidcAuthConfig } from "./src/socle/auth/OidcAuthentication";
export { InMemoryPatRepository } from "./src/socle/default-implementation/PatRepository/memory";
export { MongoPatRepository, type MongoPatConfig } from "./src/socle/default-implementation/PatRepository/mongodb";
export type { PatRepository, Pat, PatPrincipal, NewPat } from "./src/socle/interfaces/PatRepository";
export { InMemoryIdentityProviderRepository } from "./src/socle/default-implementation/IdentityProviderRepository/memory";
export { MongoIdentityProviderRepository, type MongoIdentityProviderConfig } from "./src/socle/default-implementation/IdentityProviderRepository/mongodb";
export { InMemoryLocalCredentialStore } from "./src/socle/default-implementation/LocalCredentialStore/memory";
export { MongoLocalCredentialStore, type MongoLocalCredentialConfig } from "./src/socle/default-implementation/LocalCredentialStore/mongodb";
export type { LocalCredentialStore, LocalCredential, NewCredential } from "./src/socle/interfaces/LocalCredentialStore";
export { toLoginMethod } from "./src/socle/auth/toLoginMethod";
export type {
    IdentityProvider, IdentityProviderRepository, IdentityProviderKind,
    LoginMethod, NewIdentityProvider, IdentityProviderPatch,
} from "./src/socle/interfaces/IdentityProvider";
export { InMemoryRateLimiter } from "./src/socle/default-implementation/RateLimiter/memory";
export { MongoRateLimiter, type MongoRateLimiterConfig } from "./src/socle/default-implementation/RateLimiter/mongodb";
export type { RateLimiter, RateLimitResult, RateLimitPolicy } from "./src/socle/interfaces/RateLimiter";

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
