export { CmsSecrets } from "secrets/core/CmsSecrets";
export { CmsSecretNamespaceStore, type CmsSecretNamespaceCredentials } from "secrets/core/CmsSecretNamespaceStore";
export { CmsSecretConflict, CmsSecretNotAuthorized, CmsSecretNotFound } from "secrets/core/errors";
export {
    type CmsSecretMetadata,
    type PublicSecretMetadata,
    type SecretNamespaceKeyRecord,
    type SecretNamespacePermission,
    type SecretNamespaceRecord,
} from "secrets/interfaces/CmsSecret";
export type { CmsSecretMetadataStore } from "secrets/interfaces/CmsSecretMetadataStore";

export type { CmsSecretResolutionReader } from "secrets/interfaces/CmsSecretResolutionReader";

export { publicSecretMetadata } from "secrets/core/metadata";
export type { SecretsServices, SecretsService } from "secrets/interfaces/SecretsServices";
