import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { sha256Hex } from "@bernouy/binary-media";
import type {
    FileItem,
    FilesItem,
    FolderItem,
    ItemPatch,
    NewFile,
    NewFolder,
} from "cms-content/files/interfaces/CmsFilesMetadataRepository";
import type { LocalFilesRegistry } from "./LocalFilesRegistry";
import { assertFree, childPath, removeSubtree, rewritePrefix } from "./localFsRegistryEntries";
import { listChildren, listSubtree, statItem } from "./localFsQueries";

export async function createFolder(registry: LocalFilesRegistry, input: NewFolder): Promise<FolderItem> {
    const path = childPath(registry, input.parentId, input.name);
    await assertFree(registry, path);
    await mkdir(registry.abs(path), { recursive: true });
    return (await statItem(registry, path)) as FolderItem;
}

export async function createFile(registry: LocalFilesRegistry, input: NewFile): Promise<FileItem> {
    const path = childPath(registry, input.parentId, input.name);
    await assertFree(registry, path);
    await mkdir(registry.abs(parentOf(path) ?? ""), { recursive: true });
    await writeFile(registry.abs(path), "");
    if (input.id) {
        registry.data!.byId[input.id] = { path, hash: await sha256Hex(new Uint8Array()), revision: 1 };
        registry.data!.byPath[path] = input.id;
        registry.dirty = true;
    }
    return (await statItem(registry, path)) as FileItem;
}

export async function updateItem(
    registry: LocalFilesRegistry,
    id: string,
    patch: ItemPatch,
    expectedRevision?: number,
): Promise<FilesItem | null> {
    const currentPath = registry.data!.byId[id]?.path;
    if (currentPath === undefined) {
        return null;
    }
    const current = await statItem(registry, currentPath);
    if (!current) {
        return null;
    }
    assertExpectedRevision(current.revision, expectedRevision);
    const nextParent = patch.parentId !== undefined ? patch.parentId : current.parentId;
    const nextName = patch.name ?? current.name;
    const nextParentPath = nextParent === null ? "" : registry.data!.byId[nextParent]?.path;
    if (nextParentPath === undefined) {
        throw new Error(`unknown parent "${nextParent}"`);
    }
    if (
        current.type === "folder" &&
        nextParent !== null &&
        (nextParentPath === currentPath || nextParentPath.startsWith(currentPath + "/"))
    ) {
        throw new Error("cannot move a folder into its own subtree");
    }
    const nextPath = nextParentPath ? `${nextParentPath}/${nextName}` : nextName;
    if (nextPath !== currentPath) {
        await assertFree(registry, nextPath);
        await rename(registry.abs(currentPath), registry.abs(nextPath));
        rewritePrefix(registry, currentPath, nextPath);
    }
    const entry = registry.data!.byId[id];
    if (entry) {
        entry.revision = (entry.revision ?? 1) + 1;
        registry.dirty = true;
    }
    return statItem(registry, nextPath);
}

export async function deleteItem(
    registry: LocalFilesRegistry,
    id: string,
    options: { recursive?: boolean; expectedRevision?: number } = {},
): Promise<{ deletedFileIds: string[] }> {
    const path = registry.data!.byId[id]?.path;
    if (path === undefined) {
        return { deletedFileIds: [] };
    }
    const item = await statItem(registry, path);
    if (!item) {
        return { deletedFileIds: [] };
    }
    assertExpectedRevision(item.revision, options.expectedRevision);
    if (item.type === "folder" && !options.recursive && (await listChildren(registry, item.id)).total > 0) {
        throw new Error("folder not empty");
    }
    await rm(registry.abs(path), { recursive: true, force: true });
    return { deletedFileIds: removeSubtree(registry, path) };
}

function assertExpectedRevision(actual: number, expected: number | undefined): void {
    if (expected !== undefined && actual !== expected) {
        throw Object.assign(new Error("file revision conflict"), { status: 409 });
    }
}

export async function collectSubtree(registry: LocalFilesRegistry, folderId: string): Promise<FilesItem[]> {
    return listSubtree(registry, folderId);
}

function parentOf(path: string): string | null {
    const index = path.lastIndexOf("/");
    return index === -1 ? null : path.slice(0, index);
}
