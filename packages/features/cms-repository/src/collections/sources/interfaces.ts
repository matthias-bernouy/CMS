export type CollectionRepositoryEntry = Readonly<{
    repositoryId: string;
    publisherId: string;
    collectionId: string;
    version: string;
    digest: string;
    name: string;
    description: string;
    blocCount: number;
    hasTheme: boolean;
    dashboards?: readonly { id: string; name: string; icon?: string; description?: string; viewCount: number }[];
}>;

export type CollectionRepositoryReference = Pick<
    CollectionRepositoryEntry,
    "publisherId" | "collectionId" | "version" | "digest"
>;

/** A source lists release metadata and resolves immutable bytes on the server. */
export interface CollectionRepositorySource {
    readonly id: string;
    list(): Promise<CollectionRepositoryEntry[]>;
    get(reference: CollectionRepositoryReference): Promise<unknown>;
}
