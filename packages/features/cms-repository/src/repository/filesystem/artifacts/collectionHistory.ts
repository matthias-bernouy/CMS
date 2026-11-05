import { opendir } from "node:fs/promises";
import { join } from "node:path";
import { resourceName } from "cms-repository/exports/contracts/protocol";
import { verifyCollectionPublicationHistory } from "cms-repository/exports/collections/index";
import type { CollectionRelease } from "cms-repository/exports/collections/index";
import type { LocalCollectionRepository } from "./collections";

/** Preflight inspects one lineage, including yanked releases; incomplete evidence never means compatible. */
export async function checkCollectionHistory(
    root: string,
    next: CollectionRelease,
    repository: LocalCollectionRepository,
): Promise<boolean> {
    const path = join(root, "releases", next.publisherId, resourceName(next.collectionId));
    const directory = await opendir(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (!directory) {
        return true;
    }
    const history: CollectionRelease[] = [];
    let bytes = 0;
    let scanned = 0;
    for await (const entry of directory) {
        if (++scanned > 256) {
            return false;
        }
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
            continue;
        }
        if (history.length >= 64) {
            return false;
        }
        const metadata = await repository.getMetadata(next.publisherId, next.collectionId, entry.name.slice(0, -5));
        if (!metadata) {
            throw new Error("Publication history changed during preflight");
        }
        bytes += Buffer.byteLength(metadata.canonicalJson);
        if (bytes > 32 * 1024 * 1024) {
            return false;
        }
        history.push(metadata.release);
    }
    await verifyCollectionPublicationHistory(history, next);
    return true;
}
