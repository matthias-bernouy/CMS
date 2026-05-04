import type { StorageProvider } from "../../exports/StorageProvider";
import type { StoredFile } from "../../interfaces/entities/StoredFile";

/**
 * Deletes a folder or file in `bucketId`. For non-empty folders, `recursive`
 * must be true — otherwise we throw `folder_not_empty`. The cascade is done
 * by traversing the metadata tree depth-first; each leaf file's blob (and
 * its public-path symlink, when set) is dropped before the metadata row.
 */
export async function deleteItem(
    provider: StorageProvider,
    bucketId: string,
    id: string,
    recursive: boolean,
): Promise<{ id: string }> {
    const folder = await provider.storedFolderRepo.get(id);
    if (folder && folder.bucketId === bucketId) {
        await deleteFolderRecursive(provider, bucketId, id, recursive);
        return { id };
    }

    const file = await provider.storedFileRepo.get(id);
    if (file && file.bucketId === bucketId) {
        await dropFileBlobs(provider, file);
        await provider.storedFileRepo.delete(id);
        return { id };
    }

    throw new Error(`Item "${id}" not found in bucket "${bucketId}".`);
}

async function deleteFolderRecursive(
    provider: StorageProvider,
    bucketId: string,
    folderId: string,
    recursive: boolean,
): Promise<void> {
    const [subFolders, files] = await Promise.all([
        provider.storedFolderRepo.list({ bucketId, parentFolderID: folderId, page: 1, limit: 1000 }),
        provider.storedFileRepo  .list({ bucketId, parentFolderID: folderId, page: 1, limit: 1000 }),
    ]);

    const isEmpty = subFolders.total === 0 && files.total === 0;
    if (!isEmpty && !recursive) {
        throw new Error("folder_not_empty: folder has children, pass recursive=true to cascade.");
    }

    if (!isEmpty) {
        for (const sub of subFolders.items) {
            await deleteFolderRecursive(provider, bucketId, sub.id, true);
        }
        for (const f of files.items) {
            await dropFileBlobs(provider, f);
            await provider.storedFileRepo.delete(f.id);
        }
    }

    await provider.storedFolderRepo.delete(folderId);
}

async function dropFileBlobs(provider: StorageProvider, file: StoredFile): Promise<void> {
    if (file.publicPath !== undefined) {
        await provider.blobStorage.clearPublicPath(file.bucketId, file.publicPath).catch(() => {});
    }
    await provider.blobStorage.delete(file.bucketId, file.storagePath);
}
