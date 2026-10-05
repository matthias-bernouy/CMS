import { randomUUIDv7 } from "bun";
import type { BlobStore } from "@bernouy/blob-store";
import { fileMutationJournal, recoverFileMutation } from "cms-content/files/core/lifecycle/fileMutationRecovery";
import type { CmsFileMutationJournal } from "cms-content/files/interfaces/CmsFileMutationJournal";
import type { CmsFilesMetadataRepository } from "cms-content/files/interfaces/CmsFilesMetadataRepository";

export async function deleteFileTree(
    metadata: CmsFilesMetadataRepository,
    blob: BlobStore,
    id: string,
    recursive: boolean,
    journal: CmsFileMutationJournal = fileMutationJournal(metadata),
): Promise<{ deletedFileIds: string[] }> {
    if ((metadata as unknown) === blob) {
        const result = await metadata.deleteItem(id, { recursive });
        await Promise.all(result.deletedFileIds.map((fileId) => blob.delete(fileId)));
        return result;
    }
    const pending = await journal.find(id);
    if (pending) {
        await recoverFileMutation(metadata, blob, journal, pending);
        if (pending.kind === "delete") {
            return { deletedFileIds: [...pending.fileIds] };
        }
    }
    const item = await metadata.getItem(id);
    if (!item) {
        return { deletedFileIds: [] };
    }
    const descendants = item.type === "folder" ? await metadata.listSubtree(id) : [];
    if (item.type === "folder" && descendants.length > 0 && !recursive) {
        throw new Error("folder not empty");
    }
    const items = [item, ...descendants];
    const files = items.filter((candidate) => candidate.type === "file");
    const operation = {
        id: randomUUIDv7(),
        kind: "delete" as const,
        resourceId: id,
        itemIds: items.map(({ id: itemId }) => itemId),
        fileIds: files.map(({ id: fileId }) => fileId),
        blobKeys: files.map((candidate) => candidate.blobKey ?? candidate.id),
        createdAt: new Date().toISOString(),
    };
    if (!(await journal.begin(operation))) {
        throw new Error("Another file mutation is already in progress");
    }
    await recoverFileMutation(metadata, blob, journal, operation);
    return { deletedFileIds: files.map(({ id: fileId }) => fileId) };
}
