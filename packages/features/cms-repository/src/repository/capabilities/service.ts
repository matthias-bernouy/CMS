import { RepositoryRequestError } from "../core/errors";
import { ReleaseValidationError } from "cms-repository/exports/contracts/index";
import { CollectionValidationError, CollectionPublicationError } from "cms-repository/exports/collections/index";
import { ProviderManifestValidationError } from "cms-repository/exports/providers/index";
import type { RepositoryBinaryInput, RepositoryCapabilityContext, RepositoryCapabilityPorts } from "./interfaces";
import type { RemoteCoordinate } from "../publication/types";
import { invokeRepositoryUpload } from "./uploads";
import { invokeRepositorySource } from "./sources";

export { RepositoryRequestError as RepositoryCapabilityError } from "../core/errors";

/** Actor identity is supplied by a verified transport, never selected from capability input. */
export class RepositoryCapabilityService {
    constructor(private readonly ports: RepositoryCapabilityPorts) {}

    async invoke(
        id: string,
        input: Readonly<Record<string, unknown>>,
        binary?: RepositoryBinaryInput,
        context: RepositoryCapabilityContext = {},
    ): Promise<unknown> {
        try {
            return await this.dispatch(id, input, binary, context);
        } catch (error) {
            if (error instanceof CollectionPublicationError) {
                throw new RepositoryRequestError(
                    "REJECTED",
                    error.message,
                    error.publicationCode,
                    error.publicationResource,
                );
            }
            if (
                error instanceof ReleaseValidationError ||
                error instanceof CollectionValidationError ||
                error instanceof ProviderManifestValidationError
            ) {
                throw new RepositoryRequestError("REJECTED");
            }
            throw error;
        }
    }

    private async dispatch(
        id: string,
        input: Readonly<Record<string, unknown>>,
        binary: RepositoryBinaryInput | undefined,
        context: RepositoryCapabilityContext,
    ): Promise<unknown> {
        const { namespaces } = this.ports;
        const namespace = input.namespace as string;
        if (id === "repository-info") {
            return { protocol: "ulvia-repository/v1", repositoryId: this.ports.repositoryId };
        }
        if (id === "namespace-get") {
            return namespaces.get(namespace);
        }
        if (id === "catalogue-search") {
            if (!this.ports.search) {
                throw new RepositoryRequestError("NOT_FOUND");
            }
            return this.ports.search.search(input);
        }
        if (id === "catalogue-list") {
            return this.ports.catalogue(input as Parameters<RepositoryCapabilityPorts["catalogue"]>[0], context.signal);
        }
        if (id === "collection-catalogue") {
            return this.ports.catalogue(
                {
                    ...input,
                    kind: "collection",
                    limit: input.limit as number,
                    channel: (input.channel ?? "stable") as "stable" | "beta" | "all",
                    latestPerResource: true,
                },
                context.signal,
            );
        }
        if (id === "publication-state") {
            return this.publicationState(input);
        }
        if (id === "release-download" || id === "asset-download") {
            const coordinate = input as unknown as RemoteCoordinate;
            const release = await (id === "release-download"
                ? this.ports.release(coordinate)
                : this.ports.asset(coordinate, input.assetId as string));
            if (!release) {
                throw new RepositoryRequestError("NOT_FOUND");
            }
            return release;
        }
        if (!context.accountId) {
            throw new RepositoryRequestError("REJECTED", "An authenticated account is required");
        }
        const accountId = context.accountId;
        const revision = input.namespaceRevision as number;
        switch (id) {
            case "publication-check-collection":
                return namespaces.execute(accountId, namespace, revision, async () => {
                    if (!this.ports.registry.checkCollection) {
                        throw new RepositoryRequestError("NOT_FOUND");
                    }
                    return this.ports.registry.checkCollection(input.canonicalJson as string, namespace);
                });
            case "namespace-list":
                return { namespaces: await namespaces.listOwned(accountId) };
            case "namespace-claim":
                return namespaces.claim(accountId, namespace);
            case "namespace-transfer":
                return namespaces.transfer(accountId, namespace, revision, input.targetAccountId as string);
            case "namespace-suspend":
                return namespaces.suspend(accountId, namespace, revision);
            case "source-get":
            case "source-put":
            case "artifact-source-get":
            case "artifact-source-put":
                return namespaces.execute(accountId, namespace, revision, () =>
                    invokeRepositorySource(this.ports, id, input),
                );
            case "publication-yank":
                return namespaces.execute(accountId, input.publisherId as string, revision, async () => {
                    const coordinate = input as unknown as RemoteCoordinate;
                    await this.ports.registry.setYank(
                        coordinate,
                        input.reason as string | null,
                        input.expectedRevision as number,
                    );
                    return this.publicationState(input);
                });
            case "publication-begin":
            case "publication-status":
            case "publication-asset":
            case "publication-commit":
            case "publication-abort":
                return invokeRepositoryUpload(this.ports, id, input, accountId, binary);
            default:
                throw new RepositoryRequestError("NOT_FOUND");
        }
    }

    private async publicationState(input: Readonly<Record<string, unknown>>) {
        if (!this.ports.registry.getPublicationState) {
            throw new RepositoryRequestError("NOT_FOUND");
        }
        return this.ports.registry.getPublicationState(input as unknown as RemoteCoordinate);
    }
}
