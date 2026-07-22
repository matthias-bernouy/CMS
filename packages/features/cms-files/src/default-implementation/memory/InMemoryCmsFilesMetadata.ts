import { randomUUIDv7 } from "bun";
import type {
    CmsFilesMetadataRepository,
    FilesItem,
    FolderItem,
    FileItem,
    FilesListOptions,
    FilesPage,
    NewFolder,
    NewFile,
    ItemPatch,
} from "cms-files/interfaces/CmsFilesMetadataRepository";
import {
    cloneFileItem,
    findMemoryItemByPath,
    listMemoryChildren,
    listMemorySubtree,
} from "cms-files/default-implementation/memory/inMemoryFilesQueries";

/**
 * In-memory `CmsFilesMetadataRepository` for local dev and tests. No
 * persistence. Mirrors `MongoCmsFilesMetadata` semantics (name unique per
 * folder, no move into own subtree) so swapping providers is transparent.
 * Reads return shallow copies so callers can't mutate stored rows.
 */
export class InMemoryCmsFilesMetadata implements CmsFilesMetadataRepository {
    private _items = new Map<string, FilesItem>(); // by id

    async listChildren(parentId: string | null, opts: FilesListOptions = {}): Promise<FilesPage> {
        return listMemoryChildren(this._items, parentId, opts);
    }

    async getItem(id: string): Promise<FilesItem | null> {
        const i = this._items.get(id);
        return i ? cloneFileItem(i) : null;
    }

    async getItemByPath(path: string): Promise<FilesItem | null> {
        return findMemoryItemByPath(this._items, path);
    }

    async listSubtree(folderId: string): Promise<FilesItem[]> {
        return listMemorySubtree(this._items, folderId);
    }

    async createFolder(input: NewFolder): Promise<FolderItem> {
        this._assertParent(input.parentId);
        this._assertNoClash(input.parentId, input.name);
        const now = new Date();
        const item: FolderItem = {
            id: randomUUIDv7(),
            type: "folder",
            name: input.name,
            parentId: input.parentId,
            createdAt: now,
            updatedAt: now,
        };
        this._items.set(item.id, item);
        return cloneFileItem(item) as FolderItem;
    }

    async createFile(input: NewFile): Promise<FileItem> {
        this._assertParent(input.parentId);
        const now = new Date();
        // Caller-supplied id → UPSERT (re-push updates in place); clash check
        // excludes self so re-creating the same id under the same name is fine.
        const id = input.id ?? randomUUIDv7();
        this._assertNoClash(input.parentId, input.name, input.id ? id : undefined);
        const existing = input.id ? this._items.get(id) : undefined;
        const item: FileItem = {
            id,
            type: "file",
            name: input.name,
            parentId: input.parentId,
            size: input.size,
            mimeType: input.mimeType,
            contentHash: input.contentHash,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this._items.set(id, item);
        return cloneFileItem(item) as FileItem;
    }

    async updateItem(id: string, patch: ItemPatch): Promise<FilesItem | null> {
        const item = this._items.get(id);
        if (!item) {
            return null;
        }
        const nextParent = patch.parentId !== undefined ? patch.parentId : item.parentId;
        const nextName = patch.name ?? item.name;
        if (patch.parentId !== undefined && patch.parentId !== item.parentId) {
            this._assertParent(patch.parentId);
            if (item.type === "folder" && patch.parentId !== null) {
                this._assertNotIntoOwnSubtree(id, patch.parentId);
            }
        }
        if (nextParent !== item.parentId || nextName !== item.name) {
            this._assertNoClash(nextParent, nextName, id);
        }
        const updated = { ...item, name: nextName, parentId: nextParent, updatedAt: new Date() } as FilesItem;
        this._items.set(id, updated);
        return cloneFileItem(updated);
    }

    async updateFileContent(
        id: string,
        fields: { size: number; mimeType: string; contentHash: string },
    ): Promise<FileItem | null> {
        const item = this._items.get(id);
        if (!item || item.type !== "file") {
            return null;
        }
        const updated: FileItem = {
            ...item,
            size: fields.size,
            mimeType: fields.mimeType,
            contentHash: fields.contentHash,
            updatedAt: new Date(),
        };
        this._items.set(id, updated);
        return cloneFileItem(updated) as FileItem;
    }

    async deleteItem(id: string, opts: { recursive?: boolean } = {}): Promise<{ deletedFileIds: string[] }> {
        const item = this._items.get(id);
        if (!item) {
            return { deletedFileIds: [] };
        }
        if (item.type === "file") {
            this._items.delete(id);
            return { deletedFileIds: [id] };
        }
        const subtree = await this.listSubtree(id);
        if (subtree.length && !opts.recursive) {
            throw new Error("folder not empty");
        }
        for (const s of subtree) {
            this._items.delete(s.id);
        }
        this._items.delete(id);
        return { deletedFileIds: subtree.filter((s) => s.type === "file").map((s) => s.id) };
    }

    private _assertParent(parentId: string | null): void {
        if (parentId === null) {
            return;
        }
        const p = this._items.get(parentId);
        if (!p || p.type !== "folder") {
            throw new Error("destination folder not found");
        }
    }

    private _assertNoClash(parentId: string | null, name: string, exceptId?: string): void {
        for (const i of this._items.values()) {
            if (i.parentId === parentId && i.name === name && i.id !== exceptId) {
                throw new Error(`"${name}" already exists in the destination folder`);
            }
        }
    }

    private _assertNotIntoOwnSubtree(folderId: string, targetParentId: string): void {
        let cur: string | null = targetParentId;
        while (cur !== null) {
            if (cur === folderId) {
                throw new Error("cannot move a folder into its own subtree");
            }
            cur = this._items.get(cur)?.parentId ?? null;
        }
    }
}
