import type { z } from "zod";
import type { namespacePermissionSchema } from "cms-secrets/schemas/fields";
import type { secretMetadataSchema, rotatedSecretMetadataSchema } from "cms-secrets/schemas/secrets";

export type SecretNamespacePermission = z.infer<typeof namespacePermissionSchema>;

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

export type PublicSecretMetadata = Readonly<z.infer<typeof secretMetadataSchema>>;
export type RotatedSecretMetadata = Readonly<z.infer<typeof rotatedSecretMetadataSchema>>;
