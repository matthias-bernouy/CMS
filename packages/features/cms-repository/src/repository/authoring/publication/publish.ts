import { join } from "node:path";
import { prepareCollectionRelease } from "cms-repository/collections/tooling/authoring/source";
import { parseCollectionReleaseJson } from "cms-repository/collections/core/parsing/parseCollectionRelease";
import { RepositoryRequestError } from "../../core/errors";
import { RemoteRepositoryClient } from "../../publication/client";
import { RepositorySourceClient } from "../../sources/client";
import type { CollectionPublisher } from "../CollectionAuthoring";
import type { AuthoringHost } from "../preparations/prepare";
import {
    readPreparation,
    writeRecord,
    verifyPreparedSources,
} from "cms-repository/repository/authoring/preparations/record";
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
    if (!receipt) {
        await verifyPreparedSources(path, prepared);
        const artifact = await prepareCollectionRelease(join(path, prepared.directory), host.contracts);
        if (artifact.digest !== expectedDigest || artifact.canonicalJson !== prepared.canonicalJson) {
            throw new RepositoryRequestError(
                "REJECTED",
                "Prepared collection digest changed. Prepare again before publishing.",
            );
        }
        try {
            const published = await new RemoteRepositoryClient(publisher.repositoryUrl, credential, publisher).push({
                kind: "collection",
                canonicalJson: artifact.canonicalJson,
                assets: artifact.assets,
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
                sourcesStored: false,
            } satisfies PublicationReceipt;
        } catch (error) {
            if (error instanceof RepositoryRequestError) {
                throw error;
            }
            throw new CollectionPublicationRecoveryError(id, expectedDigest, "unknown", { cause: error });
        }
    }
    try {
        // Persist the exact receipt before source retention. A retry can finish without recompilation or re-upload.
        await writeRecord(path, "publication.json", receipt);
        await new RepositorySourceClient(publisher.repositoryUrl, credential, publisher).put(
            release.collectionId,
            release.version,
            { sourceJson: prepared.sourceJson, releaseDigest: expectedDigest },
        );
        await writeRecord(path, "publication.json", { ...receipt, sourcesStored: true });
    } catch (error) {
        throw new CollectionPublicationRecoveryError(id, expectedDigest, "sources-pending", { cause: error });
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
