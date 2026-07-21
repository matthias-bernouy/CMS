import type {
    CmsFilesMetadataRepository,
    FilesListOptions,
    NewFolder,
    NewFile,
    ItemPatch,
    FolderItem,
    FileItem,
    FilesItem,
} from "cms-files/interfaces/CmsFilesMetadataRepository";
import { validateItemName } from "cms-files/core/validation";

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
        return this.inner.createFile({ ...input, name: validateItemName(input.name) });
    }

    async updateItem(id: string, patch: ItemPatch): Promise<FilesItem | null> {
        const next = patch.name !== undefined ? { ...patch, name: validateItemName(patch.name) } : patch;
        return this.inner.updateItem(id, next);
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
    updateFileContent(id: string, fields: { size: number; mimeType: string; contentHash: string }) {
        return this.inner.updateFileContent(id, fields);
    }
    deleteItem(id: string, opts?: { recursive?: boolean }) {
        return this.inner.deleteItem(id, opts);
    }
}
