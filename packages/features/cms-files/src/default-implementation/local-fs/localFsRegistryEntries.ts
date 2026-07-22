import { stat } from "node:fs/promises";
import { randomUUIDv7 } from "bun";
import { sha256Hex } from "cms-files/core/media/hashBytes";
import type { LocalFilesRegistry } from "cms-files/default-implementation/local-fs/LocalFilesRegistry";

export function childPath(registry: LocalFilesRegistry, parentId: string | null, name: string): string {
    const parentPath = parentId === null ? "" : registry.data!.byId[parentId]?.path;
    if (parentPath === undefined) {
        throw new Error(`unknown parent "${parentId}"`);
    }
    return parentPath ? `${parentPath}/${name}` : name;
}

export async function assertFree(registry: LocalFilesRegistry, path: string): Promise<void> {
    if ((await Bun.file(registry.abs(path)).exists()) || (await isDirectory(registry.abs(path)))) {
        throw new Error(`"${path}" already exists in the destination folder`);
    }
}

export async function resolveId(registry: LocalFilesRegistry, path: string, isDirectory: boolean): Promise<string> {
    const data = registry.data!;
    const existing = data.byPath[path];
    if (existing) {
        return existing;
    }
    const hash = isDirectory ? null : sha256Hex(await Bun.file(registry.abs(path)).bytes());
    const uuid = randomUUIDv7();
    data.byId[uuid] = { path, hash };
    data.byPath[path] = uuid;
    registry.dirty = true;
    return uuid;
}

export function rewritePrefix(registry: LocalFilesRegistry, oldPath: string, newPath: string): void {
    const data = registry.data!;
    for (const [uuid, entry] of Object.entries(data.byId)) {
        if (entry.path !== oldPath && !entry.path.startsWith(oldPath + "/")) {
            continue;
        }
        delete data.byPath[entry.path];
        entry.path = entry.path === oldPath ? newPath : newPath + entry.path.slice(oldPath.length);
        data.byPath[entry.path] = uuid;
    }
    registry.dirty = true;
}

export function removeSubtree(registry: LocalFilesRegistry, path: string): string[] {
    const data = registry.data!;
    const removedFileIds: string[] = [];
    for (const [uuid, entry] of Object.entries(data.byId)) {
        if (entry.path !== path && !entry.path.startsWith(path + "/")) {
            continue;
        }
        if (entry.hash !== null) {
            removedFileIds.push(uuid);
        }
        delete data.byPath[entry.path];
        delete data.byId[uuid];
    }
    registry.dirty = true;
    return removedFileIds;
}

async function isDirectory(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}
