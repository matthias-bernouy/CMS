import { RepositoryRequestError } from "../core/errors";
import type { RepositoryCapabilityPorts } from "./interfaces";
import type {
    SourceGetInput,
    SourcePutInput,
    ArtifactSourceGetInput,
    ArtifactSourcePutInput,
} from "repository/application/registry/interfaces/inputs";
import type { RemoteCoordinate } from "../publication/types";
import { isResourceId, resourcePublisher } from "@bernouy/ulvia-contracts/protocol";
import { repositoryAccount } from "./account";

export function repositorySources(ports: RepositoryCapabilityPorts) {
    const owned = async <T>(
        input: SourceGetInput | ArtifactSourceGetInput,
        accountId: string | undefined,
        operation: () => Promise<T>,
    ) =>
        ports.namespaces.execute(repositoryAccount(accountId), input.namespace, input.namespaceRevision, async () => {
            if (!ports.sources) {
                throw new RepositoryRequestError("NOT_FOUND");
            }
            const id = "collectionId" in input ? input.collectionId : input.id;
            if (
                ("kind" in input && input.kind !== "contract" && input.kind !== "provider-manifest") ||
                !isResourceId(id) ||
                resourcePublisher(id) !== input.namespace
            ) {
                throw new RepositoryRequestError("REJECTED", "Invalid source coordinate");
            }
            return operation();
        });
    const verifyRelease = async (coordinate: RemoteCoordinate, digest: string) => {
        const release = await ports.release(coordinate);
        if (!release) {
            throw new RepositoryRequestError("NOT_FOUND");
        }
        await release.stream.cancel();
        if (release.digest !== digest) {
            throw new RepositoryRequestError("REJECTED");
        }
    };
    return Object.freeze({
        getCollection: (input: SourceGetInput, accountId?: string) =>
            owned(input, accountId, async () => {
                const release = await ports.release({
                    kind: "collection",
                    publisherId: input.namespace,
                    id: input.collectionId,
                    version: input.version,
                });
                if (!release) {
                    return null;
                }
                await release.stream.cancel();
                return ports.sources!.get(input.namespace, input.collectionId, input.version);
            }),
        getArtifact: (input: ArtifactSourceGetInput, accountId?: string) =>
            owned(input, accountId, () =>
                ports.sources!.getArtifact(input.kind, input.namespace, input.id, input.version),
            ),
        putCollection: (input: SourcePutInput, accountId?: string) =>
            owned(input, accountId, async () => {
                await verifyRelease(
                    {
                        kind: "collection",
                        publisherId: input.namespace,
                        id: input.collectionId,
                        version: input.version,
                    },
                    input.releaseDigest,
                );
                if (!ports.registry.retainCollectionSources) {
                    throw new RepositoryRequestError("REJECTED", "Repository source verification is unavailable");
                }
                await ports.registry.retainCollectionSources(
                    {
                        kind: "collection",
                        publisherId: input.namespace,
                        id: input.collectionId,
                        version: input.version,
                    },
                    input.sourceJson,
                    input.releaseDigest,
                );
                return null;
            }),
        putArtifact: (input: ArtifactSourcePutInput, accountId?: string) =>
            owned(input, accountId, async () => {
                await verifyRelease(
                    { kind: input.kind, publisherId: input.namespace, id: input.id, version: input.version },
                    input.releaseDigest,
                );
                await ports.sources!.putArtifact(input.kind, input.namespace, input.id, input.version, {
                    sourceJson: input.sourceJson,
                    releaseDigest: input.releaseDigest,
                });
                return null;
            }),
    });
}
