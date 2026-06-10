// Interfaces
export * from "./interfaces/Authentication";
export * from "./interfaces/Runner";

// Serve helpers
export * from "./serve/serveApiFolder";
export { default as serveStaticFolder } from "./serve/serveStaticFolder/serveStaticFolder";

// Auth helpers
export { SignedCookieCodec } from "./auth/SignedCookieCodec";

// Utilities
export { getRequestIP, setRequestIP } from "./utilities/requestIP";
export { sha256HexAsync, randomBase64Url } from "./utilities/crypto";
export * from "./utilities/html";

// Envelope encryption (KEK + per-scope DEK + cached unwrap). The only KEK
// provider shipped is `LocalKekProvider`; consumers wiring a remote/managed
// KEK (KMS, HSM, …) supply their own implementation of `KekProvider`.
export { encryptAesGcm, decryptAesGcm, type EncryptedBlob } from "./crypto/aesGcm";
export { loadKek }                                          from "./crypto/loadKek";
export type { KekProvider }                                 from "./crypto/KekProvider";
export { LocalKekProvider, serializeBlob, parseBlob }       from "./crypto/LocalKekProvider";
export type { SecretCrypto }                                from "./crypto/SecretCrypto";
export type { DekRepository, DekRecord }                    from "./crypto/DekRepository";
export { EnvelopeSecretCrypto }                             from "./crypto/EnvelopeSecretCrypto";
