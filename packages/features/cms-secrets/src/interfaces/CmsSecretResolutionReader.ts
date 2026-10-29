import type {
    CmsSecretMetadata,
    SecretNamespaceKeyRecord,
    SecretNamespacePermission,
} from "cms-secrets/interfaces/CmsSecret";

/** One fresh storage read; plaintext may only be requested after domain authorization. */
export interface CmsSecretResolutionReader {
    read(
        input: Readonly<{
            namespaceId: string;
            keyId: string;
            name: string;
            verifier: string;
            permissions: readonly SecretNamespacePermission[];
            checkedAt: Date;
        }>,
    ): Promise<{
        readonly key: SecretNamespaceKeyRecord | null;
        readonly metadata: CmsSecretMetadata | null;
        resolveValue(): Promise<string | null>;
    }>;
}
