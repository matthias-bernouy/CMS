/**
 * @bernouy/envelope-crypto — envelope encryption.
 *
 * Root export = the contracts (`SecretCrypto`, `KekProvider`, `DekRepository`)
 * plus the dependency-free implementations (`EnvelopeSecretCrypto`,
 * `LocalKekProvider`, AES-GCM helpers, `loadKek`). The Mongo-backed DEK
 * repository lives under `@bernouy/envelope-crypto/mongo` so only composition
 * roots — the ones wiring a real database — ever import a network adapter.
 */

export { encryptAesGcm, decryptAesGcm, type EncryptedBlob } from "envelope-crypto/core/aesGcm";
export { asBuffer } from "envelope-crypto/core/buffer";
export { loadKek } from "envelope-crypto/core/loadKek";
export {
    rotateDekWrapping,
    verifyDekKeyAvailability,
    type KekRotationReport,
} from "envelope-crypto/core/rotateKek";
export type { KekProvider } from "envelope-crypto/interfaces/KekProvider";
export type { SecretCrypto } from "envelope-crypto/interfaces/SecretCrypto";
export type { DekRepository, DekRecord, DekPage } from "envelope-crypto/interfaces/DekRepository";
export {
    LocalKekProvider,
    LocalKekRingProvider,
    serializeBlob,
    parseBlob,
} from "envelope-crypto/default-implementation/LocalKekProvider";
export { EnvelopeSecretCrypto } from "envelope-crypto/default-implementation/EnvelopeSecretCrypto";
export { FieldCrypto } from "envelope-crypto/core/FieldCrypto";
