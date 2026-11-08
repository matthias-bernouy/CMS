import type { z } from "zod";
import type { sourceSnapshotSchema } from "cms-repository/application/authoring/schemas/sources";
export type RepositorySourceSnapshot = z.output<typeof sourceSnapshotSchema>;

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
