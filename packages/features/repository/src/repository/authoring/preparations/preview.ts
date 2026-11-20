import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { readPreparation, verifyPreparedSources } from "./record";
import type { AuthoringHost } from "./prepare";
import type { CollectionPublisher } from "../CollectionAuthoring";
import { parseCollectionReleaseJson } from "repository/collections/core/parsing/parseCollectionRelease";
import { verifyStoredCollectionArtifact } from "repository/collections/core/admission/collectionArtifact";
import { RepositoryRequestError } from "repository/repository/core/errors";
import { CAPTURE_LIMITS, CaptureError } from "@bernouy/browser-capture";

/** Private reads recheck current namespace ownership and never publish or install. */
export async function previewPreparation(
    host: AuthoringHost,
    publisher: CollectionPublisher,
    id: string,
    digest: string,
) {
    const { path, prepared } = await readPreparation(host.root, id, digest);
    const release = parseCollectionReleaseJson(prepared.canonicalJson);
    const credential = await publisher.credential(release.publisherId);
    if (
        prepared.repositoryOrigin !== credential.origin ||
        (prepared.repositoryId !== null && prepared.repositoryId !== credential.repositoryId)
    ) {
        throw new RepositoryRequestError("REJECTED", "Preparation belongs to another Repository connection.");
    }
    await verifyPreparedSources(path, prepared);
    let bytes = 0;
    const assets = [];
    for (const asset of release.assets) {
        bytes += asset.byteLength;
        if (bytes > CAPTURE_LIMITS.inputBytes) {
            throw new CaptureError("LIMIT_EXCEEDED");
        }
        const file = await open(
            join(path, prepared.directory, "assets", asset.id),
            constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
            const info = await file.stat();
            if (!info.isFile() || info.size !== asset.byteLength) {
                throw new RepositoryRequestError("REJECTED", "Prepared asset changed.");
            }
            assets.push({ id: asset.id, bytes: new Uint8Array(await file.readFile()) });
        } finally {
            await file.close();
        }
    }
    return verifyStoredCollectionArtifact(release, assets, digest);
}
