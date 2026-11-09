import { join } from "node:path";
import { parseSourceSnapshot } from "../snapshot";
import { parseCollectionReleaseJson } from "repository/collections/core/parsing/parseCollectionRelease";
import { RepositoryRequestError } from "../../core/errors";
import { RemoteRepositoryClient } from "../../publication/client";
import type { CollectionPublisher } from "../CollectionAuthoring";
import type { AuthoringHost } from "../preparations/prepare";
import {
    readPreparation,
    writeRecord,
    verifyPreparedSources,
} from "repository/repository/authoring/preparations/record";
import { CollectionPublicationRecoveryError } from "../preparations/errors";
import { readReceipt } from "./receipt";
import type { PublicationReceipt } from "./receipt";

export async function publishPreparedCollection(
    host: AuthoringHost,
    publisher: CollectionPublisher,
    id: string,
    expectedDigest: string,
) {
    const { path, prepared } = await readPreparation(host.root, id, expectedDigest);
    const release = parseCollectionReleaseJson(prepared.canonicalJson);
    const credential = await publisher.credential(release.publisherId);
    if (
        prepared.repositoryOrigin !== credential.origin ||
        (prepared.repositoryId !== null && prepared.repositoryId !== credential.repositoryId)
    ) {
        throw new RepositoryRequestError(
            "REJECTED",
            "Preparation belongs to another Repository. Prepare again against the current connection.",
        );
    }
    let receipt = await readReceipt(path, expectedDigest, credential);
    let added = false;
    if (!receipt || !receipt.sourcesStored) {
        await verifyPreparedSources(path, prepared);
        const snapshot = parseSourceSnapshot(prepared.sourceJson);
        const assets = snapshot.assets.map((asset) => ({
            id: asset.path.slice(7),
            bytes: Bun.file(join(path, prepared.directory, asset.path)),
        }));
        try {
            const published = await new RemoteRepositoryClient(publisher.repositoryUrl, credential, publisher).push({
                kind: "collection",
                canonicalJson: prepared.canonicalJson,
                sourceJson: prepared.sourceJson,
                assets,
            });
            if (published.digest !== expectedDigest) {
                throw new Error("Publication digest mismatch");
            }
            added = published.added;
            receipt = {
                schema: "ulvia.collection-publication.v1",
                digest: expectedDigest,
                origin: credential.origin,
                repositoryId: credential.repositoryId,
                namespace: credential.namespace,
                added: published.added,
                sourcesStored: true,
            } satisfies PublicationReceipt;
        } catch (error) {
            if (error instanceof RepositoryRequestError) {
                throw error;
            }
            throw new CollectionPublicationRecoveryError(id, expectedDigest, "unknown", { cause: error });
        }
    }
    try {
        // The Repository retained verified sources before exposing the release.
        await writeRecord(path, "publication.json", receipt);
    } catch (error) {
        throw new CollectionPublicationRecoveryError(id, expectedDigest, "unknown", { cause: error });
    }
    return {
        added,
        digest: expectedDigest,
        kind: "collection" as const,
        repositoryId: publisher.repositorySourceId,
        publisherId: release.publisherId,
        collectionId: release.collectionId,
        version: release.version,
    };
}
