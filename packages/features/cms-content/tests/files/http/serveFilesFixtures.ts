import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { InMemoryCmsFilesMetadata } from "@bernouy/cms-content/files";

export const FILES_PREFIX = "/.cms/files/";
export const encode = new TextEncoder();

export async function seedFile(
    metadata: InMemoryCmsFilesMetadata,
    blob: MemoryBlobStore,
    options: { folder: string; name: string; mimeType: string; bytes: Uint8Array },
): Promise<{ folderId: string; fileId: string }> {
    const folder = await metadata.createFolder({ name: options.folder, parentId: null });
    const file = await metadata.createFile({
        name: options.name,
        parentId: folder.id,
        size: options.bytes.byteLength,
        mimeType: options.mimeType,
    });
    await blob.put(file.id, options.bytes);
    return { folderId: folder.id, fileId: file.id };
}

export function filesRequest(path: string, init?: RequestInit): Request {
    return new Request(`http://x${path}`, init);
}
