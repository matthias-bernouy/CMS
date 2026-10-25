export type NamespaceProof = Readonly<{
    protocol: "ulvia-repository-owner/v1";
    repositoryId: string;
    namespace: string;
    revision: number;
    action: string;
    subject: string;
    digest: string;
    timestamp: number;
    nonce: string;
    signature: string;
}>;

export type RepositoryNamespace = Readonly<{
    namespace: string;
    revision: number;
    publicKey: string;
    revoked: boolean;
    updatedAt: string;
    action: "claim" | "rotate" | "revoke";
    previousDigest: string | null;
}>;

/** The callback holds exclusive namespace ownership, including during authorized writes. */
export interface RepositoryNamespaceStore {
    get(namespace: string, revision?: number): Promise<RepositoryNamespace | null>;
    exclusive<T>(
        namespace: string,
        operation: (
            current: RepositoryNamespace | null,
            save: (next: RepositoryNamespace) => Promise<void>,
        ) => Promise<T>,
    ): Promise<T>;
}
