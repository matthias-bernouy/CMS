import type { CmsSecretMetadata, PublicSecretMetadata, RotatedSecretMetadata } from "secrets/interfaces/CmsSecret";

export function publicSecretMetadata(secret: CmsSecretMetadata & { readonly rotatedAt: Date }): RotatedSecretMetadata;
export function publicSecretMetadata(secret: CmsSecretMetadata): PublicSecretMetadata;
export function publicSecretMetadata(secret: CmsSecretMetadata): PublicSecretMetadata {
    return {
        namespaceId: secret.namespaceId,
        secretId: secret.id,
        name: secret.name,
        version: secret.version,
        createdAt: secret.createdAt.toISOString(),
        rotatedAt: secret.rotatedAt?.toISOString() ?? null,
    };
}
