export { CmsSecrets } from "cms-secrets/core/CmsSecrets";
export { CmsSecretNamespaceStore, type CmsSecretNamespaceCredentials } from "cms-secrets/core/CmsSecretNamespaceStore";
export { CmsSecretConflict, CmsSecretNotAuthorized, CmsSecretNotFound } from "cms-secrets/core/errors";
export {
    type CmsSecretMetadata,
    type PublicSecretMetadata,
    type SecretNamespaceKeyRecord,
    type SecretNamespacePermission,
    type SecretNamespaceRecord,
} from "cms-secrets/interfaces/CmsSecret";
export type { CmsSecretMetadataStore } from "cms-secrets/interfaces/CmsSecretMetadataStore";

export type { CmsSecretResolutionReader } from "cms-secrets/interfaces/CmsSecretResolutionReader";

export { publicSecretMetadata } from "cms-secrets/core/metadata";
export type { SecretsServices, SecretsService } from "cms-secrets/interfaces/SecretsServices";
