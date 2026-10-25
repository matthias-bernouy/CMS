export interface RepositorySourceSnapshot {
    readonly sourceJson: string;
    readonly releaseDigest: string;
}

export interface RepositorySourceStore {
    get(namespace: string, collectionId: string, version: string): Promise<RepositorySourceSnapshot | null>;
    put(namespace: string, collectionId: string, version: string, snapshot: RepositorySourceSnapshot): Promise<void>;
}
