/**
 * Mongo adapters of @bernouy/cms-secrets — imported by composition roots
 * only (the packages wiring a real database), never by surfaces that just
 * consume the `SecretStore` contract.
 */

export {
    EncryptedMongoSecretStore,
    type EncryptedSecretDocument,
    type EncryptedMongoSecretStoreConfig,
} from "cms-secrets/default-implementation/EncryptedMongoSecretStore";
