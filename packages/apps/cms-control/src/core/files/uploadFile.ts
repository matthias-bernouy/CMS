import type { CmsFilesMetadataRepository, FileItem } from "@bernouy/cms-shared";
import type { CmsFilesBlobStore } from "@bernouy/cms-shared";

/**
 * Upload a file: create its metadata record (which mints the id, or adopts the
 * supplied `id`), then store the bytes under that id (`id` IS the blob key).
 * Metadata-first so we have the key; on a blob failure the record is rolled back,
 * so we never leave a file record without its bytes.
 *
 * `id` is optional: UI uploads omit it (a fresh id is minted); the CLI push
 * passes the dev registry uuid so the remote `_id` matches dev — keeping
 * `by-id` URLs stable across the push.
 */
export async function uploadFile(
    metadata: CmsFilesMetadataRepository,
    blob: CmsFilesBlobStore,
    file: File,
    parentId: string | null,
    id?: string,
): Promise<FileItem> {
    const item = await metadata.createFile({
        name:     file.name,
        parentId,
        size:     file.size,
        mimeType: file.type || "application/octet-stream",
        ...(id ? { id } : {}),
    });
    try {
        await blob.put(item.id, file);
    } catch (err) {
        await metadata.deleteItem(item.id).catch(() => {}); // rollback, best-effort
        throw err;
    }
    return item;
}
