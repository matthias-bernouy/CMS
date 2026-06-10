import type { CmsFilesMetadataRepository, FileItem } from "cms-files/interfaces/CmsFilesMetadataRepository";
import type { CmsFilesBlobStore } from "cms-files/interfaces/CmsFilesBlobStore";
import { sha256Hex } from "cms-files/core/hashBytes";
import { validateUploadSize } from "cms-files/core/validation";

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
    // Read the bytes once: hash them for `contentHash` AND store them, so we
    // never re-read and the hash always matches what `put` writes.
    validateUploadSize(file.size);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const item = await metadata.createFile({
        name:        file.name,
        parentId,
        size:        file.size,
        mimeType:    file.type || "application/octet-stream",
        contentHash: sha256Hex(bytes),
        ...(id ? { id } : {}),
    });
    try {
        await blob.put(item.id, bytes);
    } catch (err) {
        await metadata.deleteItem(item.id).catch(() => {}); // rollback, best-effort
        throw err;
    }
    return item;
}
