import type { RepositorySourceStore } from "../sources/interfaces";
import type { RepositoryNamespaceAuthority } from "../namespaces/authority";
import type {
    RemoteCoordinate,
    RepositoryPublicationRegistry,
    RepositoryPublicationUploadStore,
} from "../publication/types";

export interface RepositoryCapabilityPorts {
    readonly sources?: RepositorySourceStore;
    readonly namespaces: RepositoryNamespaceAuthority;
    readonly registry: RepositoryPublicationRegistry;
    readonly uploads: RepositoryPublicationUploadStore;
    readonly catalogue: (input: { kind: RemoteCoordinate["kind"]; limit: number; cursor?: string }) => Promise<{
        releases: readonly (RemoteCoordinate & { digest: string })[];
        nextCursor?: string;
    }>;
    readonly release: (coordinate: RemoteCoordinate) => Promise<{
        stream: ReadableStream<Uint8Array>;
        contentType: string;
        contentLength: number;
        digest: string;
    } | null>;
}
