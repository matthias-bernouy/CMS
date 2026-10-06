import type {
    CmsFilesMetadataRepository,
    FilesListOptions,
    NewFolder,
    NewFile,
    ItemPatch,
    FolderItem,
    FileItem,
    FilesItem,
} from "cms-content/files/interfaces/CmsFilesMetadataRepository";
import { validateContentHash, validateItemName } from "cms-content/files/core/validation/validation";

/**
 * Decorator that enforces the item-name rule on every metadata write before
 * delegating — the unbypassable barrier so no writer (admin API, CLI push, …)
 * can store a nameless folder or file. Names are also normalized (trimmed)
 * here, so the inner repo only ever sees canonical names. Reads, content
 * refreshes and deletes pass straight through.
 *
 *   `new ValidatingCmsFilesMetadata(new MongoCmsFilesMetadata(db))`
 */
export class ValidatingCmsFilesMetadata implements CmsFilesMetadataRepository {
    constructor(private readonly inner: CmsFilesMetadataRepository) {}

    async createFolder(input: NewFolder): Promise<FolderItem> {
        return this.inner.createFolder({ ...input, name: validateItemName(input.name) });
    }

    async createFile(input: NewFile): Promise<FileItem> {
        return this.inner.createFile({
            ...input,
            name: validateItemName(input.name),
            contentHash: input.contentHash === undefined ? undefined : validateContentHash(input.contentHash),
        });
    }

    commitFile(input: NewFile & { id: string; contentHash: string; blobKey: string }, expectedBlobKey: string | null) {
        return this.inner.commitFile(
            {
                ...input,
                name: validateItemName(input.name),
                contentHash: validateContentHash(input.contentHash),
            },
            expectedBlobKey,
        );
    }

    async updateItem(id: string, patch: ItemPatch, expectedRevision?: number): Promise<FilesItem | null> {
        const next = patch.name !== undefined ? { ...patch, name: validateItemName(patch.name) } : patch;
        return this.inner.updateItem(id, next, expectedRevision);
    }

    listChildren(parentId: string | null, opts?: FilesListOptions) {
        return this.inner.listChildren(parentId, opts);
    }
    getItem(id: string) {
        return this.inner.getItem(id);
    }
    getItemByPath(path: string) {
        return this.inner.getItemByPath(path);
    }
    listSubtree(folderId: string) {
        return this.inner.listSubtree(folderId);
    }
    updateFileContent(
        id: string,
        fields: { size: number; mimeType: string; contentHash: string },
        expectedRevision?: number,
    ) {
        return this.inner.updateFileContent(
            id,
            { ...fields, contentHash: validateContentHash(fields.contentHash) },
            expectedRevision,
        );
    }
    deleteItem(id: string, opts?: { recursive?: boolean; expectedRevision?: number }) {
        return this.inner.deleteItem(id, opts);
    }
    deleteItems(ids: readonly string[]) {
        return this.inner.deleteItems(ids);
    }
}
