import type { CmsFilesMetadataRepository } from "src/socle/interfaces/CmsFilesMetadataRepository";
import type { CmsFilesBlobStore } from "src/socle/interfaces/CmsFilesBlobStore";

/**
 * Delete a file or folder from the tree, then purge the bytes of every file
 * that was removed. Metadata is the source of truth for which blobs to drop
 * (`deletedFileIds`); blob deletes are idempotent and best-effort.
 */
export async function deleteFileTree(
    metadata: CmsFilesMetadataRepository,
    blob: CmsFilesBlobStore,
    id: string,
    recursive: boolean,
): Promise<{ deletedFileIds: string[] }> {
    const res = await metadata.deleteItem(id, { recursive });
    await Promise.all(res.deletedFileIds.map(fileId => blob.delete(fileId)));
    return res;
}
