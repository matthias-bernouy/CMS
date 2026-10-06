import { randomUUIDv7 } from "bun";
import type { BlobStore } from "@bernouy/blob-store";
import { fileMutationJournal, recoverFileMutation } from "cms-content/files/core/lifecycle/fileMutationRecovery";
import type { CmsFileMutationJournal, FileDeleteMutation } from "cms-content/files/interfaces/CmsFileMutationJournal";
import type { CmsFilesMetadataRepository } from "cms-content/files/interfaces/CmsFilesMetadataRepository";

export async function deleteFileTree(
    metadata: CmsFilesMetadataRepository,
    blob: BlobStore,
    id: string,
    recursive: boolean,
    journal: CmsFileMutationJournal = fileMutationJournal(metadata),
    expectedRevision?: number,
): Promise<{ deletedFileIds: string[] }> {
    if ((metadata as unknown) === blob) {
        return journal.withTreeWrite(async () => {
            const result = await metadata.deleteItem(id, { recursive, expectedRevision });
            await Promise.all(result.deletedFileIds.map((fileId) => blob.delete(fileId)));
            return result;
        });
    }
    const pending = await journal.find(id);
    if (pending) {
        await recoverFileMutation(metadata, blob, journal, pending);
        if (pending.kind === "delete") {
            return { deletedFileIds: [...pending.fileIds] };
        }
    }
    const operation = await journal.withTreeWrite(async (): Promise<FileDeleteMutation | null> => {
        const item = await metadata.getItem(id);
        if (!item) {
            return null;
        }
        if (expectedRevision !== undefined && item.revision !== expectedRevision) {
            throw Object.assign(new Error("file revision conflict"), { status: 409 });
        }
        const descendants = item.type === "folder" ? await metadata.listSubtree(id) : [];
        if (item.type === "folder" && descendants.length > 0 && !recursive) {
            throw new Error("folder not empty");
        }
        const items = [item, ...descendants];
        const files = items.filter((candidate) => candidate.type === "file");
        const intent: FileDeleteMutation = {
            id: randomUUIDv7(),
            kind: "delete",
            resourceId: id,
            itemIds: items.map(({ id: itemId }) => itemId),
            fileIds: files.map(({ id: fileId }) => fileId),
            blobKeys: files.map((candidate) => candidate.blobKey ?? candidate.id),
            createdAt: new Date().toISOString(),
        };
        if (!(await journal.begin(intent))) {
            throw new Error("Another file mutation is already in progress");
        }
        await metadata.deleteItems(intent.itemIds);
        return intent;
    });
    if (!operation) {
        return { deletedFileIds: [] };
    }
    for (const blobKey of operation.blobKeys) {
        await blob.delete(blobKey);
    }
    await journal.complete(operation.id);
    return { deletedFileIds: [...operation.fileIds] };
}
