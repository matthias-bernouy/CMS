import type { CmsFilesMetadataRepository, FileItem } from "cms-files/interfaces/CmsFilesMetadataRepository";
import type { CmsFilesBlobStore } from "cms-files/interfaces/CmsFilesBlobStore";
import { sha256Hex } from "cms-files/core/media/hashBytes";
import { validateUploadSize } from "cms-files/core/validation/validation";

/**
 * Replace a file's BYTES in place, keeping its id (and name/parentId). Used by
 * the "update file" admin action: every page that references `/by-id/<id>` keeps
 * its URL, and the renderer's `?v=<contentHash>` token changes with the bytes so
 * the immutable cache busts. Returns the refreshed `FileItem`, or `null` if `id`
 * is unknown or not a file.
 *
 * Bytes-first: write the new blob, then record its hash/size on the metadata, so
 * a metadata failure leaves the old hash (pages keep serving the old version)
 * rather than pointing an immutable URL at bytes that aren't there yet.
 */
export async function updateFileContent(
    metadata: CmsFilesMetadataRepository,
    blob: CmsFilesBlobStore,
    id: string,
    file: File,
): Promise<FileItem | null> {
    const cur = await metadata.getItem(id);
    if (!cur || cur.type !== "file") {
        return null;
    }

    validateUploadSize(file.size);
    const bytes = new Uint8Array(await file.arrayBuffer());
    await blob.put(id, bytes);
    return metadata.updateFileContent(id, {
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        contentHash: sha256Hex(bytes),
    });
}
