import { isSha256Digest } from "@bernouy/binary-media";
import { RepositoryRequestError } from "../core/errors";
import { manifestPublisher } from "../publication/ownership";
import { parsePublicationUpload, readPublicationMetadata } from "../publication/protocol";
import type { RepositoryCapabilityPorts, RepositoryBinaryInput } from "./interfaces";

export async function invokeRepositoryUpload(
    ports: RepositoryCapabilityPorts,
    id: string,
    input: Readonly<Record<string, unknown>>,
    accountId: string,
    binary?: RepositoryBinaryInput,
) {
    const namespace = input.namespace as string;
    const namespaceRevision = input.namespaceRevision as number;
    return ports.namespaces.execute(accountId, namespace, namespaceRevision, async () => {
        if (id === "publication-begin") {
            if (!binary) {
                throw new RepositoryRequestError("REJECTED", "Publication metadata bytes are required");
            }
            const manifest = parsePublicationUpload(
                await readPublicationMetadata(binary.stream, undefined, binary.contentLength),
            );
            if (manifestPublisher(manifest) !== namespace) {
                throw new RepositoryRequestError("REJECTED", "Publication is outside the owned namespace");
            }
            return ports.uploads.create(
                { ...manifest, owner: { accountId, namespace, namespaceRevision } },
                new Date(Date.now() + 60 * 60_000),
            );
        }
        const uploadId = input.uploadId as string;
        const manifest = await ports.uploads.describe(uploadId);
        if (
            manifest.owner.accountId !== accountId ||
            manifest.owner.namespace !== namespace ||
            manifest.owner.namespaceRevision !== namespaceRevision ||
            manifestPublisher(manifest) !== namespace
        ) {
            throw new RepositoryRequestError("REJECTED", "Upload belongs to a different account or ownership revision");
        }
        switch (id) {
            case "publication-status":
                return ports.uploads.status(uploadId);
            case "publication-commit": {
                const result = await ports.uploads.commit(uploadId, (envelope) => ports.registry.publish(envelope));
                return { kind: result.kind, added: result.added, digest: result.digest };
            }
            case "publication-abort":
                await ports.uploads.abort(uploadId);
                return null;
            case "publication-asset":
                if (!binary || !isSha256Digest(input.contentDigest)) {
                    throw new RepositoryRequestError("REJECTED", "Asset bytes and their SHA-256 digest are required");
                }
                await ports.uploads.putAsset(
                    uploadId,
                    input.assetId as string,
                    binary.stream,
                    input.contentDigest,
                    binary.contentLength,
                );
                return null;
            default:
                throw new RepositoryRequestError("NOT_FOUND");
        }
    });
}
