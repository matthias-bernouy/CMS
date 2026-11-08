/** Runtime-owned secret resolution, pinned to one CMS Repository origin and instance. */
export type RepositoryConnectionCredential = Readonly<{
    origin: string;
    repositoryId: string;
    resolveToken(): Promise<string>;
}>;

export type RepositoryNamespaceCredential = RepositoryConnectionCredential &
    Readonly<{
        namespace: string;
        revision: number;
    }>;
