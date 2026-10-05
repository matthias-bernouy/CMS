import { randomUUIDv7 } from "bun";
import type { BlobStore } from "@bernouy/blob-store";
import { sha256Hex } from "@bernouy/binary-media";
import { assertFileMediaType } from "cms-content/files/core/media/fileIntegrity";
import {
    commitFileMutation,
    fileMutationJournal,
    recoverFileMutation,
} from "cms-content/files/core/lifecycle/fileMutationRecovery";
import { validateUploadSize } from "cms-content/files/core/validation/validation";
import type { CmsFileMutationJournal } from "cms-content/files/interfaces/CmsFileMutationJournal";
import type { CmsFilesMetadataRepository, FileItem } from "cms-content/files/interfaces/CmsFilesMetadataRepository";

export async function uploadFile(
    metadata: CmsFilesMetadataRepository,
    blob: BlobStore,
    file: File,
    parentId: string | null,
    id?: string,
    journal: CmsFileMutationJournal = fileMutationJournal(metadata),
): Promise<FileItem> {
    if ((metadata as unknown) === blob) {
        return journal.withTreeWrite(() => legacyUpload(metadata, blob, file, parentId, id));
    }
    validateUploadSize(file.size);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    assertFileMediaType(mimeType, bytes);
    const contentHash = await sha256Hex(bytes);
    const resourceId = id ?? randomUUIDv7();
    const pending = await journal.find(resourceId);
    if (pending) {
        await recoverFileMutation(metadata, blob, journal, pending);
    }
    const existing = await metadata.getItem(resourceId);
    if (existing?.type === "folder") {
        throw new Error("A folder already uses the requested file id");
    }
    const operationId = randomUUIDv7();
    const previousBlobKey = existing ? (existing.blobKey ?? existing.id) : null;
    const blobKey = existing ? `${resourceId}/versions/${operationId}` : resourceId;
    const target = {
        id: resourceId,
        name: file.name,
        parentId,
        size: file.size,
        mimeType,
        contentHash,
        blobKey,
    };
    const operation = {
        id: operationId,
        kind: "write" as const,
        resourceId,
        previousBlobKey,
        target,
        createdAt: new Date().toISOString(),
    };
    if (!(await journal.begin(operation))) {
        throw new Error("Another file mutation is already in progress");
    }

    try {
        await blob.put(blobKey, bytes);
    } catch (error) {
        await discardUnpublishedBlob(blob, journal, operationId, blobKey);
        throw error;
    }
    const item = await commitFileMutation(metadata, journal, operation);
    if (!item) {
        await blob.delete(blobKey);
        await journal.complete(operationId);
        throw new Error("The file changed while its bytes were being stored");
    }
    if (previousBlobKey && previousBlobKey !== blobKey) {
        try {
            await blob.delete(previousBlobKey);
        } catch {
            return item;
        }
    }
    await journal.complete(operationId);
    return item;
}

async function discardUnpublishedBlob(
    blob: BlobStore,
    journal: CmsFileMutationJournal,
    operationId: string,
    blobKey: string,
): Promise<void> {
    try {
        await blob.delete(blobKey);
        await journal.complete(operationId);
    } catch {
        // Recovery keeps the durable intent until the blob backend is available.
    }
}

async function legacyUpload(
    metadata: CmsFilesMetadataRepository,
    blob: BlobStore,
    file: File,
    parentId: string | null,
    id?: string,
): Promise<FileItem> {
    validateUploadSize(file.size);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    assertFileMediaType(mimeType, bytes);
    const item = await metadata.createFile({
        name: file.name,
        parentId,
        size: file.size,
        mimeType,
        contentHash: await sha256Hex(bytes),
        ...(id ? { id } : {}),
    });
    try {
        await blob.put(item.id, bytes);
    } catch (error) {
        await metadata.deleteItem(item.id).catch(() => undefined);
        throw error;
    }
    return item;
}
