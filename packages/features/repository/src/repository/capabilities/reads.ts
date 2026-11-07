import type { CollectionCatalogueOutput } from "repository/application/registry/interfaces/outputs";
import { RepositoryRequestError } from "../core/errors";
import type { RepositoryCapabilityPorts } from "./interfaces";
import type {
    CatalogueListInput,
    CollectionCatalogueInput,
    CatalogueSearchInput,
    NamespaceGetInput,
    PublicationStateInput,
    ReleaseDownloadInput,
    AssetDownloadInput,
} from "repository/application/registry/interfaces/inputs";

export function repositoryReads(ports: RepositoryCapabilityPorts) {
    return Object.freeze({
        async info() {
            return { protocol: "ulvia-repository/v1", repositoryId: ports.repositoryId };
        },
        async namespace(input: NamespaceGetInput) {
            return ports.namespaces.get(input.namespace);
        },
        async catalogue(input: CatalogueListInput, signal?: AbortSignal) {
            return ports.catalogue(input, signal);
        },
        async collectionCatalogue(
            input: CollectionCatalogueInput,
            signal?: AbortSignal,
        ): Promise<CollectionCatalogueOutput> {
            return ports.catalogue(
                { ...input, kind: "collection", channel: input.channel ?? "stable", latestPerResource: true },
                signal,
            );
        },
        async search(input: CatalogueSearchInput) {
            if (!ports.search) {
                throw new RepositoryRequestError("NOT_FOUND");
            }
            return ports.search.search(input);
        },
        async publicationState(input: PublicationStateInput) {
            if (!ports.registry.getPublicationState) {
                throw new RepositoryRequestError("NOT_FOUND");
            }
            return ports.registry.getPublicationState(input);
        },
        async release(input: ReleaseDownloadInput) {
            const release = await ports.release(input);
            if (!release) {
                throw new RepositoryRequestError("NOT_FOUND");
            }
            return release;
        },
        async asset(input: AssetDownloadInput) {
            const asset = await ports.asset(input, input.assetId);
            if (!asset) {
                throw new RepositoryRequestError("NOT_FOUND");
            }
            return asset;
        },
    });
}
