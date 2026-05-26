// Interfaces
export * from "./interfaces/CDN";
export * from "./interfaces/Mailer";
export * from "./interfaces/Authentication";
export * from "./interfaces/Runner";

// Serve helpers
export * from "./serve/serveApiFolder";
export { default as serveStaticFolder } from "./serve/serveStaticFolder/serveStaticFolder";

// Auth helpers
export * from "./auth/requireRole";

// Credentials (bearer-token authentication)
export * from "./credentials/Credential";
export * from "./credentials/CredentialRepository";
export * from "./credentials/CredentialAuthentication";
export * from "./credentials/generateBearerToken";

// Utilities
export { getRequestIP, setRequestIP } from "./utilities/requestIP";
export { sha256Hex, randomBase64Url } from "./utilities/crypto";
export * from "./utilities/html";
export * from "./utilities/concurrencyLimit";

// Envelope encryption (KEK + per-scope DEK + cached unwrap). Used by
// cms-control-mt to encrypt per-tenant admin secrets.
export { encryptAesGcm, decryptAesGcm, type EncryptedBlob } from "./crypto/aesGcm";
export { loadKek }                                          from "./crypto/loadKek";
export type { KekProvider }                                 from "./crypto/KekProvider";
export { LocalKekProvider, serializeBlob, parseBlob }       from "./crypto/LocalKekProvider";
export { OvhOkmsKekProvider, OvhOkmsError, type OvhOkmsKekProviderConfig } from "./crypto/OvhOkmsKekProvider";
export type { SecretCrypto }                                from "./crypto/SecretCrypto";
export type { DekRepository, DekRecord }                    from "./crypto/DekRepository";
export { EnvelopeSecretCrypto }                             from "./crypto/EnvelopeSecretCrypto";
