import { randomUUIDv7 } from "bun";
import type { BlobStore } from "@bernouy/blob-store";
import { sha256Hex } from "@bernouy/binary-media";
import { assertFileMediaType } from "cms-content/files/core/media/fileIntegrity";
import { fileMutationJournal, recoverFileMutation } from "cms-content/files/core/lifecycle/fileMutationRecovery";
import { validateUploadSize } from "cms-content/files/core/validation/validation";
import type { CmsFileMutationJournal } from "cms-content/files/interfaces/CmsFileMutationJournal";
import type { CmsFilesMetadataRepository, FileItem } from "cms-content/files/interfaces/CmsFilesMetadataRepository";

export async function updateFileContent(
    metadata: CmsFilesMetadataRepository,
    blob: BlobStore,
    id: string,
    file: File,
    journal: CmsFileMutationJournal = fileMutationJournal(metadata),
): Promise<FileItem | null> {
    const pending = await journal.find(id);
    if (pending) {
        await recoverFileMutation(metadata, blob, journal, pending);
    }
    const current = await metadata.getItem(id);
    if (!current || current.type !== "file") {
        return null;
    }
    if ((metadata as unknown) === blob) {
        return legacyUpdate(metadata, blob, current, file);
    }

    validateUploadSize(file.size);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    assertFileMediaType(mimeType, bytes);
    const operationId = randomUUIDv7();
    const previousBlobKey = current.blobKey ?? current.id;
    const target = {
        id,
        name: current.name,
        parentId: current.parentId,
        size: file.size,
        mimeType,
        contentHash: await sha256Hex(bytes),
        blobKey: `${id}/versions/${operationId}`,
    };
    if (
        !(await journal.begin({
            id: operationId,
            kind: "write",
            resourceId: id,
            previousBlobKey,
            target,
            createdAt: new Date().toISOString(),
        }))
    ) {
        throw new Error("Another file mutation is already in progress");
    }

    try {
        await blob.put(target.blobKey, bytes);
    } catch (error) {
        try {
            await blob.delete(target.blobKey);
            await journal.complete(operationId);
        } catch {
            // Recovery keeps the durable intent until the blob backend is available.
        }
        throw error;
    }
    const item = await metadata.commitFile(target, previousBlobKey);
    if (!item) {
        await blob.delete(target.blobKey);
        await journal.complete(operationId);
        throw new Error("The file changed while its bytes were being stored");
    }
    try {
        await blob.delete(previousBlobKey);
    } catch {
        return item;
    }
    await journal.complete(operationId);
    return item;
}

async function legacyUpdate(
    metadata: CmsFilesMetadataRepository,
    blob: BlobStore,
    current: FileItem,
    file: File,
): Promise<FileItem | null> {
    validateUploadSize(file.size);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    assertFileMediaType(mimeType, bytes);
    await blob.put(current.id, bytes);
    return metadata.updateFileContent(current.id, {
        size: file.size,
        mimeType,
        contentHash: await sha256Hex(bytes),
    });
}
