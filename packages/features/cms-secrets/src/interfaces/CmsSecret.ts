export type SecretNamespacePermission =
    | "secrets.metadata.read"
    | "secrets.resolve"
    | "secrets.write"
    | "secrets.delete"
    | "namespace.manage";

export type SecretNamespaceRecord = Readonly<{
    id: string;
    name: string;
    createdAt: Date;
    createdBy: {
        kind: "administrator" | "provider" | "system";
        id: string;
    };
}>;

export type SecretNamespaceKeyRecord = Readonly<{
    id: string;
    namespaceId: string;
    verifier: string;
    permissions: readonly SecretNamespacePermission[];
    createdAt: Date;
    expiresAt?: Date;
    revokedAt?: Date;
}>;

export type CmsSecretMetadata = Readonly<{
    id: string;
    namespaceId: string;
    name: string;
    storageKey: string;
    version: number;
    createdAt: Date;
    rotatedAt?: Date;
}>;

export type PublicSecretMetadata = Readonly<{
    namespaceId: string;
    secretId: string;
    name: string;
    version: number;
    createdAt: string;
    rotatedAt: string | null;
}>;

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
