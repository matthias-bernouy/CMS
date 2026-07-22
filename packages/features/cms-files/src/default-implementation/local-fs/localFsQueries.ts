import { readdir, stat } from "node:fs/promises";
import type { FilesItem, FilesListOptions, FilesPage } from "cms-files/interfaces/CmsFilesMetadataRepository";
import { CMS_FILES_REGISTRY_NAME, type LocalFilesRegistry } from "./LocalFilesRegistry";
import { resolveId } from "./localFsRegistryEntries";

const EMPTY_PAGE: FilesPage = { items: [], total: 0, page: 1, limit: 0, hasMore: false };

export async function listChildren(
    registry: LocalFilesRegistry,
    parentId: string | null,
    options: FilesListOptions = {},
): Promise<FilesPage> {
    const directory = parentId === null ? "" : registry.data!.byId[parentId]?.path;
    if (directory === undefined) {
        return EMPTY_PAGE;
    }
    let names: string[];
    try {
        names = await readdir(registry.abs(directory));
    } catch {
        return EMPTY_PAGE;
    }
    let items = (
        await Promise.all(
            names
                .filter((name) => name !== CMS_FILES_REGISTRY_NAME)
                .map((name) => statItem(registry, directory ? `${directory}/${name}` : name)),
        )
    ).filter(Boolean) as FilesItem[];
    if (options.accept) {
        items = items.filter((item) => options.accept!.includes(item.type));
    }
    if (options.search) {
        const query = options.search.toLowerCase();
        items = items.filter((item) => item.name.toLowerCase().includes(query));
    }
    items.sort(comparator(options.sortBy ?? "name", options.sortOrder ?? "asc"));
    const total = items.length;
    const limit = options.pagination?.limit ?? total;
    const page = options.pagination?.page ?? 1;
    const start = options.pagination ? (page - 1) * limit : 0;
    const slice = options.pagination ? items.slice(start, start + limit) : items;
    return { items: slice, total, page, limit, hasMore: start + slice.length < total };
}

export async function statItem(registry: LocalFilesRegistry, path: string): Promise<FilesItem | null> {
    if (!path) {
        return null;
    }
    let details: Awaited<ReturnType<typeof stat>>;
    try {
        details = await stat(registry.abs(path));
    } catch {
        return null;
    }
    const id = await resolveId(registry, path, details.isDirectory());
    const parentPath = parentOf(path);
    const parentId = parentPath ? await resolveId(registry, parentPath, true) : null;
    const base = {
        id,
        name: path.split("/").pop()!,
        parentId,
        createdAt: details.birthtime,
        updatedAt: details.mtime,
    };
    if (details.isDirectory()) {
        return { ...base, type: "folder" };
    }
    const file = Bun.file(registry.abs(path));
    return {
        ...base,
        type: "file",
        size: details.size,
        mimeType: file.type || "application/octet-stream",
        contentHash: registry.data!.byId[id]!.hash ?? undefined,
    };
}

export async function getItemByPath(registry: LocalFilesRegistry, path: string): Promise<FilesItem | null> {
    return statItem(registry, normalize(path));
}

export async function listSubtree(registry: LocalFilesRegistry, folderId: string): Promise<FilesItem[]> {
    const output: FilesItem[] = [];
    const stack = [folderId];
    while (stack.length) {
        const page = await listChildren(registry, stack.pop()!);
        for (const item of page.items) {
            output.push(item);
            if (item.type === "folder") {
                stack.push(item.id);
            }
        }
    }
    return output;
}

function normalize(path: string): string {
    return path
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join("/");
}

function parentOf(path: string): string | null {
    const index = path.lastIndexOf("/");
    return index === -1 ? null : path.slice(0, index);
}

function comparator(by: NonNullable<FilesListOptions["sortBy"]>, order: "asc" | "desc") {
    const direction = order === "asc" ? 1 : -1;
    return (left: FilesItem, right: FilesItem): number => {
        const leftValue = sortKey(left, by);
        const rightValue = sortKey(right, by);
        if (leftValue === rightValue) {
            return 0;
        }
        if (leftValue === undefined) {
            return 1;
        }
        if (rightValue === undefined) {
            return -1;
        }
        return ((leftValue as number) < (rightValue as number) ? -1 : 1) * direction;
    };
}

function sortKey(item: FilesItem, by: NonNullable<FilesListOptions["sortBy"]>): string | number | undefined {
    const value = (item as Record<string, unknown>)[by];
    if (value instanceof Date) {
        return value.getTime();
    }
    return typeof value === "string" || typeof value === "number" ? value : undefined;
}
