import { isSha256Digest } from "@bernouy/binary-media";
import { RepositoryRequestError } from "../core/errors";
import { manifestPublisher } from "../publication/ownership";
import { parsePublicationUpload, readPublicationMetadata } from "../publication/protocol";
import type { RepositoryCapabilityPorts, RepositoryBinaryInput } from "./interfaces";
import type {
    PublicationBeginInput,
    PublicationAssetInput,
    PublicationStatusInput,
    PublicationYankInput,
    PublicationCheckCollectionInput,
} from "repository/application/registry/interfaces/inputs";
import { repositoryAccount } from "./account";

export function repositoryPublications(ports: RepositoryCapabilityPorts) {
    const owned = async <T>(
        input: PublicationStatusInput,
        account: string | undefined,
        operation: () => Promise<T>,
    ) => {
        const accountId = repositoryAccount(account);
        return ports.namespaces.execute(accountId, input.namespace, input.namespaceRevision, async () => {
            const manifest = await ports.uploads.describe(input.uploadId);
            if (
                manifest.owner.accountId !== accountId ||
                manifest.owner.namespace !== input.namespace ||
                manifest.owner.namespaceRevision !== input.namespaceRevision ||
                manifestPublisher(manifest) !== input.namespace
            ) {
                throw new RepositoryRequestError(
                    "REJECTED",
                    "Upload belongs to a different account or ownership revision",
                );
            }
            return operation();
        });
    };
    return Object.freeze({
        async begin(input: PublicationBeginInput, account: string | undefined, binary?: RepositoryBinaryInput) {
            const accountId = repositoryAccount(account);
            return ports.namespaces.execute(accountId, input.namespace, input.namespaceRevision, async () => {
                if (!binary) {
                    throw new RepositoryRequestError("REJECTED", "Publication metadata bytes are required");
                }
                const manifest = parsePublicationUpload(
                    await readPublicationMetadata(binary.stream, undefined, binary.contentLength),
                );
                if (manifestPublisher(manifest) !== input.namespace) {
                    throw new RepositoryRequestError("REJECTED", "Publication is outside the owned namespace");
                }
                return ports.uploads.create(
                    {
                        ...manifest,
                        owner: { accountId, namespace: input.namespace, namespaceRevision: input.namespaceRevision },
                    },
                    new Date(Date.now() + 60 * 60_000),
                );
            });
        },
        status: (input: PublicationStatusInput, accountId?: string) =>
            owned(input, accountId, () => ports.uploads.status(input.uploadId)),
        asset: (input: PublicationAssetInput, accountId: string | undefined, binary?: RepositoryBinaryInput) =>
            owned(input, accountId, async () => {
                if (!binary || !isSha256Digest(input.contentDigest)) {
                    throw new RepositoryRequestError("REJECTED", "Asset bytes and their SHA-256 digest are required");
                }
                await ports.uploads.putAsset(
                    input.uploadId,
                    input.assetId,
                    binary.stream,
                    input.contentDigest,
                    binary.contentLength,
                );
                return null;
            }),
        commit: (input: PublicationStatusInput, accountId?: string) =>
            owned(input, accountId, async () => {
                const result = await ports.uploads.commit(input.uploadId, (envelope) =>
                    ports.registry.publish(envelope),
                );
                return { kind: result.kind, added: result.added, digest: result.digest };
            }),
        abort: (input: PublicationStatusInput, accountId?: string) =>
            owned(input, accountId, async () => {
                await ports.uploads.abort(input.uploadId);
                return null;
            }),
        async yank(input: PublicationYankInput, accountId?: string) {
            return ports.namespaces.execute(
                repositoryAccount(accountId),
                input.publisherId,
                input.namespaceRevision,
                async () => {
                    await ports.registry.setYank(input, input.reason, input.expectedRevision);
                    if (!ports.registry.getPublicationState) {
                        throw new RepositoryRequestError("NOT_FOUND");
                    }
                    return ports.registry.getPublicationState(input);
                },
            );
        },
        async checkCollection(input: PublicationCheckCollectionInput, accountId?: string) {
            return ports.namespaces.execute(
                repositoryAccount(accountId),
                input.namespace,
                input.namespaceRevision,
                async () => {
                    if (!ports.registry.checkCollection) {
                        throw new RepositoryRequestError("NOT_FOUND");
                    }
                    return ports.registry.checkCollection(input.canonicalJson, input.namespace);
                },
            );
        },
    });
}
