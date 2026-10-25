import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { manifestPublisher } from "../namespaces/publication";
import { parsePublicationUpload } from "../publication/protocol";
import { repositoryDigest, parseNamespaceProof } from "../namespaces/proofs";
import type { RepositoryCapabilityPorts } from "./interfaces";
import type { RemoteCoordinate } from "../publication/types";
import { RepositoryRequestError } from "../core/errors";
import { ReleaseValidationError } from "cms-repository/exports/contracts/index";
import { CollectionValidationError } from "cms-repository/exports/collections/index";
import { ProviderManifestValidationError } from "cms-repository/exports/providers/index";

export { RepositoryRequestError as RepositoryCapabilityError } from "../core/errors";

/** Feature operations shared by contract transports; no HTTP credentials or runtime adapters. */
export class RepositoryCapabilityService {
    constructor(private readonly ports: RepositoryCapabilityPorts) {}

    async invoke(
        capabilityId: string,
        input: Readonly<Record<string, unknown>>,
        binary?: {
            stream: ReadableStream<Uint8Array>;
            contentLength?: number;
        },
    ): Promise<unknown> {
        try {
            return await this.dispatch(capabilityId, input, binary);
        } catch (error) {
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
        binary?: { stream: ReadableStream<Uint8Array>; contentLength?: number },
    ): Promise<unknown> {
        const namespaces = this.ports.namespaces;
        const namespace = input.namespace as string;
        if (id === "repository-info") {
            return { protocol: "ulvia-community-repository/v1", repositoryId: namespaces.repositoryId };
        }
        if (id === "namespace-get") {
            return namespaces.get(namespace, input.revision as number | undefined);
        }
        if (id === "catalogue-list") {
            return this.ports.catalogue(input as Parameters<RepositoryCapabilityPorts["catalogue"]>[0]);
        }
        if (id === "publication-state") {
            if (!this.ports.registry.getPublicationState) {
                throw new RepositoryRequestError("NOT_FOUND");
            }
            return this.ports.registry.getPublicationState(input as unknown as RemoteCoordinate);
        }
        if (id === "publication-yank") {
            const coordinate = {
                kind: input.kind,
                publisherId: input.publisherId,
                id: input.id,
                version: input.version,
            } as RemoteCoordinate;
            const proof = parseNamespaceProof(parseStrictJson(input.proof as string, 4_096, 4));
            const reason = input.reason as string | null;
            const expectedRevision = input.expectedRevision as number;
            return namespaces.execute(
                coordinate.publisherId,
                id,
                repositoryDigest(coordinate),
                repositoryDigest({ coordinate, reason, expectedRevision }),
                proof,
                async () => {
                    await this.ports.registry.setYank(coordinate, reason, expectedRevision);
                    return this.ports.registry.getPublicationState!(coordinate);
                },
            );
        }
        if (id === "release-download") {
            const release = await this.ports.release(input as unknown as RemoteCoordinate);
            if (!release) {
                throw new RepositoryRequestError("NOT_FOUND");
            }
            return release;
        }
        if (id === "source-get" || id === "source-put") {
            if (!this.ports.sources) {
                throw new RepositoryRequestError("NOT_FOUND");
            }
            const collectionId = input.collectionId as string;
            const version = input.version as string;
            const source =
                id === "source-put"
                    ? { collectionId, version, sourceJson: input.sourceJson, releaseDigest: input.releaseDigest }
                    : { collectionId, version };
            const proof = parseNamespaceProof(parseStrictJson(input.proof as string, 4_096, 4));
            return namespaces.execute(
                namespace,
                id,
                `${collectionId}@${version}`,
                repositoryDigest(source),
                proof,
                async () => {
                    if (id === "source-get") {
                        return this.ports.sources!.get(namespace, collectionId, version);
                    }
                    const release = await this.ports.release({
                        kind: "collection",
                        publisherId: namespace,
                        id: collectionId,
                        version,
                    });
                    if (!release) {
                        throw new RepositoryRequestError("NOT_FOUND");
                    }
                    await release.stream.cancel();
                    if (release.digest !== input.releaseDigest) {
                        throw new RepositoryRequestError("REJECTED");
                    }
                    await this.ports.sources!.put(namespace, collectionId, version, {
                        sourceJson: input.sourceJson as string,
                        releaseDigest: input.releaseDigest as string,
                    });
                    return null;
                },
            );
        }
        const proof = parseNamespaceProof(parseStrictJson(input.proof as string, 4_096, 4));
        if (id === "namespace-claim") {
            return namespaces.claim(namespace, input.publicKey as string, proof);
        }
        if (id === "namespace-rotate") {
            return namespaces.rotate(
                namespace,
                input.publicKey as string,
                proof,
                parseStrictJson(input.replacementProof as string, 4_096, 4),
            );
        }
        if (id === "namespace-revoke") {
            return namespaces.revoke(namespace, proof);
        }
        if (id === "publication-begin") {
            const manifest = parsePublicationUpload(new TextEncoder().encode(input.manifest as string));
            if (manifestPublisher(manifest) !== namespace) {
                throw new RepositoryRequestError("REJECTED");
            }
            return namespaces.execute(namespace, id, namespace, repositoryDigest(manifest), proof, () =>
                this.ports.uploads.create(manifest, new Date(Date.now() + 60 * 60_000)),
            );
        }
        const uploadId = input.uploadId as string;
        const subject = id === "publication-asset" ? `${uploadId}/${input.assetId}` : uploadId;
        const digest = id === "publication-asset" ? proof.digest : repositoryDigest({ uploadId });
        return namespaces.execute(namespace, id, subject, digest, proof, async () => {
            const manifest = await this.ports.uploads.describe(uploadId);
            if (manifestPublisher(manifest) !== namespace) {
                throw new RepositoryRequestError("REJECTED");
            }
            switch (id) {
                case "publication-status":
                    return this.ports.uploads.status(uploadId);
                case "publication-commit": {
                    const result = await this.ports.uploads.commit(uploadId, (envelope) =>
                        this.ports.registry.publish(envelope),
                    );
                    return { kind: result.kind, added: result.added, digest: result.digest };
                }
                case "publication-abort":
                    await this.ports.uploads.abort(uploadId);
                    return null;
                case "publication-asset":
                    if (!binary) {
                        throw new RepositoryRequestError("REJECTED");
                    }
                    await this.ports.uploads.putAsset(
                        uploadId,
                        input.assetId as string,
                        binary.stream,
                        proof.digest as `sha256:${string}`,
                        binary.contentLength,
                    );
                    return null;
                default:
                    throw new RepositoryRequestError("NOT_FOUND");
            }
        });
    }
}
