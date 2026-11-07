import type { CatalogueListInput } from "repository/application/registry/interfaces/inputs";
import type { CatalogueListOutput } from "repository/application/registry/interfaces/outputs";
import type { RepositorySearch } from "../search/core/service";
import type { RepositorySourceStore } from "../sources/interfaces";
import type { RepositoryNamespaces } from "../namespaces/accounts/RepositoryNamespaces";
import type {
    RemoteCoordinate,
    RepositoryPublicationRegistry,
    RepositoryPublicationUploadStore,
} from "../publication/types";

export interface RepositoryCapabilityPorts {
    readonly repositoryId: string;
    readonly search?: RepositorySearch;
    readonly sources?: RepositorySourceStore;
    readonly namespaces: RepositoryNamespaces;
    readonly registry: RepositoryPublicationRegistry;
    readonly uploads: RepositoryPublicationUploadStore;
    readonly catalogue: (
        input: CatalogueListInput & { readonly latestPerResource?: boolean },
        signal?: AbortSignal,
    ) => Promise<CatalogueListOutput>;
    readonly release: (coordinate: RemoteCoordinate) => Promise<{
        stream: ReadableStream<Uint8Array>;
        contentType: string;
        contentLength: number;
        digest: string;
    } | null>;
    readonly asset: (coordinate: RemoteCoordinate, assetId: string) => ReturnType<RepositoryCapabilityPorts["release"]>;
}

export type RepositoryBinaryInput = Readonly<{ stream: ReadableStream<Uint8Array>; contentLength?: number }>;
