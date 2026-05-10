// Public classes
export * from "./exports/StorageProvider";
export * from "./exports/StorageTokenBroker";
export * from "./exports/StorageBrowser";
export * from "./exports/StorageDirectClient";
export * from "./exports/BucketsClient";
export * from "./exports/BucketProxyPublisher";

// Repository implementations (Mongo)
export * from "./default-implementation/mongo/MongoBucketRepository";
export * from "./default-implementation/mongo/MongoBucketCredentialRepository";
export * from "./default-implementation/mongo/MongoPreSignedTokenRepository";
export * from "./default-implementation/mongo/MongoAliasRepository";
export * from "./default-implementation/mongo/MongoStoredFolderRepository";
export * from "./default-implementation/mongo/MongoStoredFileRepository";
export * from "./default-implementation/mongo/MongoBucketDekRepository";
export * from "./default-implementation/mongo/MongoBucketProxyRepository";

// Blob storage implementation
export * from "./default-implementation/LocalBlobStorage";

// Crypto
export * from "./default-implementation/EnvelopeSecretCrypto";
export * from "./core/crypto/SecretCrypto";
export * from "./core/crypto/loadKek";
export * from "./core/crypto/encrypt";

// Proxy helpers (consumed by `@bernouy/cdn-node`'s edge-api endpoint)
export * from "./core/proxy/buildSecretsManifest";
export * from "./core/proxy/placeholderName";
export * from "./core/proxy/upsertProxy";
export * from "./core/proxy/deleteProxy";

// Proxy rules DSL — parser + validator + codegen (consumed by @bernouy/cms
// for its data-provider validate endpoint, and by anything wanting to
// pre-validate before submitting to the admin API).
export { parseRulesConfig }      from "./core/proxy/rules/parseRulesConfig";
export { ProxyRulesParseError }  from "./core/proxy/rules/parseHelpers";
export { validateRules, ProxyRulesValidationError } from "./core/proxy/rules/validateRules";
export { compileRulesConfig }    from "./core/proxy/codegen/compileRulesConfig";
export type { CompileRulesOptions, CompiledRules } from "./core/proxy/codegen/compileRulesConfig";
export { RULE_TEMPLATES } from "./core/proxy/rules/templates";
export type { RulesTemplate } from "./core/proxy/rules/templates";

// Repository contracts
export * from "./interfaces/repositories/BucketRepository";
export * from "./interfaces/repositories/BucketCredentialRepository";
export * from "./interfaces/repositories/PreSignedTokenRepository";
export * from "./interfaces/repositories/AliasRepository";
export * from "./interfaces/repositories/StoredFolderRepository";
export * from "./interfaces/repositories/StoredFileRepository";
export * from "./interfaces/repositories/BucketProxyRepository";
export * from "./interfaces/BlobStorage";

// Entities
export * from "./interfaces/entities/Bucket";
export * from "./interfaces/entities/BucketCredential";
export * from "./interfaces/entities/PreSignedToken";
export * from "./interfaces/entities/Alias";
export * from "./interfaces/entities/StoredFolder";
export * from "./interfaces/entities/StoredFile";
export * from "./interfaces/entities/BucketProxy";

// Proxy rules DSL (the declarative grammar consumers send via BucketsClient + BucketProxyPublisher)
export * from "./interfaces/proxy/ProxyRule";
export * from "./interfaces/proxy/RulesConfig";

// Wire envelope (admin / broker shared response shape)
export * from "./interfaces/wire/AdminResponse";
