export type CmsSecretMetadata = Readonly<{
    id: string;
    name: string;
    storageKey: string;
    version: number;
    createdAt: Date;
    rotatedAt?: Date;
}>;

export type PublicSecretMetadata = Readonly<{
    secretId: string;
    name: string;
    version: number;
    createdAt: string;
    rotatedAt: string | null;
}>;

export function publicSecretMetadata(secret: CmsSecretMetadata): PublicSecretMetadata {
    return {
        secretId: secret.id,
        name: secret.name,
        version: secret.version,
        createdAt: secret.createdAt.toISOString(),
        rotatedAt: secret.rotatedAt?.toISOString() ?? null,
    };
}
