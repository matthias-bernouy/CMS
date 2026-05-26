import type { CmsFilesMetadataRepository, FileItem } from "src/socle/interfaces/CmsFilesMetadataRepository";
import type { CmsFilesBlobStore } from "src/socle/interfaces/CmsFilesBlobStore";

/**
 * Upload a file: create its metadata record (which mints the id), then store
 * the bytes under that id (`id` IS the blob key). Metadata-first so we have the
 * key; on a blob failure the record is rolled back, so we never leave a file
 * record without its bytes.
 */
export async function uploadFile(
    metadata: CmsFilesMetadataRepository,
    blob: CmsFilesBlobStore,
    file: File,
    parentId: string | null,
): Promise<FileItem> {
    const item = await metadata.createFile({
        name:     file.name,
        parentId,
        size:     file.size,
        mimeType: file.type || "application/octet-stream",
    });
    try {
        await blob.put(item.id, file);
    } catch (err) {
        await metadata.deleteItem(item.id).catch(() => {}); // rollback, best-effort
        throw err;
    }
    return item;
}
