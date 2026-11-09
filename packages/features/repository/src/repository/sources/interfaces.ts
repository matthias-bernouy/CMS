import type { SourceReadOutput } from "repository/application/registry/interfaces/outputs";
export type RepositorySourceSnapshot = NonNullable<SourceReadOutput>;

export type ArtifactSourceKind = "contract" | "provider-manifest";

export interface RepositorySourceStore {
    get(namespace: string, collectionId: string, version: string): Promise<RepositorySourceSnapshot | null>;
    put(namespace: string, collectionId: string, version: string, snapshot: RepositorySourceSnapshot): Promise<void>;
    getArtifact(
        kind: ArtifactSourceKind,
        namespace: string,
        id: string,
        version: string,
    ): Promise<RepositorySourceSnapshot | null>;
    putArtifact(
        kind: ArtifactSourceKind,
        namespace: string,
        id: string,
        version: string,
        snapshot: RepositorySourceSnapshot,
    ): Promise<void>;
}
