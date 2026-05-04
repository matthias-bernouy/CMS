import type { StorageProvider } from "../../exports/StorageProvider";
import type { CDNItem } from "../../../../../../interfaces/CDN";

/**
 * Returns the folder OR file matching `id` within `bucketId`. The two-step
 * lookup matches `deleteItem`'s pattern; ids are globally unique so at most
 * one of the two hits.
 */
export async function getItem(
    provider: StorageProvider,
    bucketId: string,
    id: string,
): Promise<CDNItem> {
    const folder = await provider.storedFolderRepo.get(id);
    if (folder && folder.bucketId === bucketId) return folder;

    const file = await provider.storedFileRepo.get(id);
    if (file && file.bucketId === bucketId) return file;

    throw new Error(`Item "${id}" not found in bucket "${bucketId}".`);
}
