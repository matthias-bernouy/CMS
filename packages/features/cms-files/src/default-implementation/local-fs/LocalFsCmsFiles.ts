import { mkdir, unlink } from "node:fs/promises";
import type { BlobInput, CmsFilesBlobStore } from "cms-files/interfaces/CmsFilesBlobStore";
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
} from "cms-files/interfaces/CmsFilesMetadataRepository";
import {
    CMS_FILES_REGISTRY_NAME,
    LocalFilesRegistry,
    type ReconcileOptions,
    type ReconcileResult,
} from "./LocalFilesRegistry";
import { collectSubtree, createFile, createFolder, deleteItem, updateItem } from "./localFsMutations";
import { getItemByPath, listChildren, statItem } from "./localFsQueries";
import { reconcileLocalFiles } from "./reconcileLocalFiles";
import { sha256Hex } from "cms-files/core/media/hashBytes";

export { CMS_FILES_REGISTRY_NAME, type ReconcileOptions, type ReconcileResult };

/**
 * Filesystem-native metadata and blob store for local development. The media
 * directory is the tree; a sibling registry keeps stable UUIDs across direct
 * filesystem moves and renames.
 */
export class LocalFsCmsFiles implements CmsFilesMetadataRepository, CmsFilesBlobStore {
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

    updateItem(id: string, patch: ItemPatch): Promise<FilesItem | null> {
        return this.withRegistry(() => updateItem(this.registry, id, patch));
    }

    async updateFileContent(id: string): Promise<FileItem | null> {
        const item = await this.getItem(id);
        return item?.type === "file" ? item : null;
    }

    deleteItem(id: string, options: { recursive?: boolean } = {}): Promise<{ deletedFileIds: string[] }> {
        return this.withRegistry(() => deleteItem(this.registry, id, options));
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
            this.registry.data!.byId[key]!.hash = sha256Hex(await Bun.file(absolutePath).bytes());
            this.registry.dirty = true;
            return { size };
        });
    }

    async get(key: string): Promise<ReadableStream<Uint8Array> | null> {
        await this.registry.ensure();
        const path = this.registry.data!.byId[key]?.path;
        if (path === undefined) {
            return null;
        }
        const file = Bun.file(this.registry.abs(path));
        return (await file.exists()) ? file.stream() : null;
    }

    async delete(key: string): Promise<void> {
        await this.registry.ensure();
        const path = this.registry.data!.byId[key]?.path;
        if (path !== undefined) {
            await unlink(this.registry.abs(path)).catch(() => {});
        }
    }

    async exists(key: string): Promise<boolean> {
        await this.registry.ensure();
        const path = this.registry.data!.byId[key]?.path;
        return path === undefined ? false : Bun.file(this.registry.abs(path)).exists();
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
