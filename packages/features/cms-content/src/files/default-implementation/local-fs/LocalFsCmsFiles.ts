import { mkdir, unlink } from "node:fs/promises";
import { assertBlobRange, type BlobInput, type BlobReadOptions, type BlobStore } from "@bernouy/blob-store";
import type {
    CmsFilesMetadataRepository,
    FileItem,
    FilesItem,
    FilesListOptions,
    FilesPage,
    FolderItem,
    ItemPatch,
    NewFile,
    NewFolder,
} from "cms-content/files/interfaces/CmsFilesMetadataRepository";
import {
    CMS_FILES_REGISTRY_NAME,
    LocalFilesRegistry,
    type ReconcileOptions,
    type ReconcileResult,
} from "./LocalFilesRegistry";
import { collectSubtree, createFile, createFolder, deleteItem, updateItem } from "./localFsMutations";
import { getItemByPath, listChildren, statItem } from "./localFsQueries";
import { reconcileLocalFiles } from "./reconcileLocalFiles";
import { sha256Hex } from "@bernouy/binary-media";

export { CMS_FILES_REGISTRY_NAME, type ReconcileOptions, type ReconcileResult };

/**
 * Filesystem-native metadata and blob store for local development. The media
 * directory is the tree; a sibling registry keeps stable UUIDs across direct
 * filesystem moves and renames.
 */
export class LocalFsCmsFiles implements CmsFilesMetadataRepository, BlobStore {
    private readonly registry: LocalFilesRegistry;

    constructor(root: string) {
        this.registry = new LocalFilesRegistry(root);
    }

    listChildren(parentId: string | null, options: FilesListOptions = {}): Promise<FilesPage> {
        return this.withRegistry(() => listChildren(this.registry, parentId, options));
    }

    getItem(id: string): Promise<FilesItem | null> {
        return this.withRegistry(() => {
            const path = this.registry.data!.byId[id]?.path;
            return path === undefined ? Promise.resolve(null) : statItem(this.registry, path);
        });
    }

    getItemByPath(path: string): Promise<FilesItem | null> {
        return this.withRegistry(() => getItemByPath(this.registry, path));
    }

    listSubtree(folderId: string): Promise<FilesItem[]> {
        return this.withRegistry(() => collectSubtree(this.registry, folderId));
    }

    createFolder(input: NewFolder): Promise<FolderItem> {
        return this.withRegistry(() => createFolder(this.registry, input));
    }

    createFile(input: NewFile): Promise<FileItem> {
        return this.withRegistry(() => createFile(this.registry, input));
    }

    async commitFile(
        input: NewFile & { id: string; contentHash: string; blobKey: string },
        expectedBlobKey: string | null,
    ): Promise<FileItem | null> {
        const current = await this.getItem(input.id);
        if ((current?.type === "file" ? current.id : null) !== expectedBlobKey) {
            return null;
        }
        return this.createFile(input);
    }

    updateItem(id: string, patch: ItemPatch, expectedRevision?: number): Promise<FilesItem | null> {
        return this.withRegistry(() => updateItem(this.registry, id, patch, expectedRevision));
    }

    async updateFileContent(
        id: string,
        _fields: { size: number; mimeType: string; contentHash: string },
        expectedRevision?: number,
    ): Promise<FileItem | null> {
        const item = await this.getItem(id);
        if (item?.type === "file" && expectedRevision !== undefined && item.revision !== expectedRevision) {
            throw Object.assign(new Error("file revision conflict"), { status: 409 });
        }
        return item?.type === "file" ? item : null;
    }

    deleteItem(
        id: string,
        options: { recursive?: boolean; expectedRevision?: number } = {},
    ): Promise<{ deletedFileIds: string[] }> {
        return this.withRegistry(() => deleteItem(this.registry, id, options));
    }

    async deleteItems(ids: readonly string[]): Promise<void> {
        for (const id of ids) {
            await this.deleteItem(id, { recursive: true });
        }
    }

    put(key: string, data: BlobInput): Promise<{ size: number }> {
        return this.withRegistry(async () => {
            const path = this.registry.data!.byId[key]?.path;
            if (path === undefined) {
                throw new Error(`put: unknown id "${key}"`);
            }
            const absolutePath = this.registry.abs(path);
            await mkdir(this.registry.abs(parentOf(path) ?? ""), { recursive: true });
            const size = await Bun.write(absolutePath, new Response(data as BodyInit));
            this.registry.data!.byId[key]!.hash = await sha256Hex(await Bun.file(absolutePath).bytes());
            this.registry.data!.byId[key]!.revision = (this.registry.data!.byId[key]!.revision ?? 1) + 1;
            this.registry.dirty = true;
            return { size };
        });
    }

    async get(key: string, options: BlobReadOptions = {}): Promise<ReadableStream<Uint8Array> | null> {
        await this.registry.ensure();
        const path = this.registry.data!.byId[key]?.path;
        if (path === undefined) {
            return null;
        }
        const file = Bun.file(this.registry.abs(path));
        if (!(await file.exists())) {
            return null;
        }
        if (!options.range) {
            return file.stream();
        }
        assertBlobRange(options.range, file.size);
        return file.slice(options.range.start, options.range.end + 1).stream();
    }

    async head(key: string): Promise<{ size: number } | null> {
        await this.registry.ensure();
        const path = this.registry.data!.byId[key]?.path;
        if (path === undefined) {
            return null;
        }
        const file = Bun.file(this.registry.abs(path));
        return (await file.exists()) ? { size: file.size } : null;
    }

    async delete(key: string): Promise<void> {
        await this.registry.ensure();
        const path = this.registry.data!.byId[key]?.path;
        if (path !== undefined) {
            await unlink(this.registry.abs(path)).catch(() => {});
        }
    }

    async exists(key: string): Promise<boolean> {
        return (await this.head(key)) !== null;
    }

    reconcile(options: ReconcileOptions = {}): Promise<ReconcileResult> {
        return reconcileLocalFiles(this.registry, options);
    }

    private async withRegistry<T>(operation: () => Promise<T>): Promise<T> {
        await this.registry.ensure();
        try {
            return await operation();
        } finally {
            await this.registry.flush();
        }
    }
}

function parentOf(path: string): string | null {
    const index = path.lastIndexOf("/");
    return index === -1 ? null : path.slice(0, index);
}
