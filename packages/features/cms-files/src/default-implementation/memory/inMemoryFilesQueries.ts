import type { FilesItem, FilesListOptions, FilesPage } from "cms-files/interfaces/CmsFilesMetadataRepository";

export function listMemoryChildren(
    items: Map<string, FilesItem>,
    parentId: string | null,
    options: FilesListOptions,
): FilesPage {
    let rows = [...items.values()].filter((item) => item.parentId === parentId);
    if (options.accept) {
        rows = rows.filter((item) => options.accept!.includes(item.type));
    }
    if (options.search) {
        const query = options.search.toLowerCase();
        rows = rows.filter((item) => item.name.toLowerCase().includes(query));
    }
    rows.sort(comparator(options.sortBy ?? "name", options.sortOrder ?? "asc"));
    const total = rows.length;
    const limit = options.pagination?.limit ?? total;
    const page = options.pagination?.page ?? 1;
    const start = options.pagination ? (page - 1) * limit : 0;
    const slice = options.pagination ? rows.slice(start, start + limit) : rows;
    return { items: slice.map(cloneFileItem), total, page, limit, hasMore: start + slice.length < total };
}

export function findMemoryItemByPath(items: Map<string, FilesItem>, path: string): FilesItem | null {
    const segments = path
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);
    let parentId: string | null = null;
    let found: FilesItem | undefined;
    for (const segment of segments) {
        found = [...items.values()].find((item) => item.parentId === parentId && item.name === segment);
        if (!found) {
            return null;
        }
        parentId = found.id;
    }
    return found ? cloneFileItem(found) : null;
}

export function listMemorySubtree(items: Map<string, FilesItem>, folderId: string): FilesItem[] {
    const output: FilesItem[] = [];
    const stack = [folderId];
    while (stack.length) {
        const parentId = stack.pop()!;
        for (const item of items.values()) {
            if (item.parentId !== parentId) {
                continue;
            }
            output.push(cloneFileItem(item));
            if (item.type === "folder") {
                stack.push(item.id);
            }
        }
    }
    return output;
}

export const cloneFileItem = (item: FilesItem): FilesItem => ({ ...item });

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
    if (typeof value === "string" || typeof value === "number") {
        return value;
    }
    return undefined;
}
