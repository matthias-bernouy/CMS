import { dataValueAtPath } from "cms-sources/core/validation/parseDataShape";
import type { SourceIndexingEntity } from "cms-sources/interfaces/SourceIndexing";

export type ProjectedIndexingDiscoveryItem = {
    identity: string | number;
    lastModified?: string;
};

export type ProjectedIndexingDiscoveryPage = {
    items: ProjectedIndexingDiscoveryItem[];
    /** Raw collection size, including malformed items skipped by projection. */
    itemCount: number;
    total?: number;
    nextCursor?: string;
};

/** Project one discovery response without exposing undeclared source fields. */
export function projectIndexingDiscoveryPage(
    entity: SourceIndexingEntity,
    response: unknown,
): ProjectedIndexingDiscoveryPage | null {
    const discovered = dataValueAtPath(response, entity.discover.itemsPath);
    if (!Array.isArray(discovered)) {
        return null;
    }

    const items: ProjectedIndexingDiscoveryItem[] = [];
    for (const item of discovered) {
        const identity = scalarAtPath(item, entity.discover.identityPath);
        if (identity === undefined || identity === "") {
            continue;
        }
        const lastModified = entity.discover.lastModifiedPath
            ? dataValueAtPath(item, entity.discover.lastModifiedPath)
            : undefined;
        items.push({
            identity,
            ...(typeof lastModified === "string" && lastModified ? { lastModified } : {}),
        });
    }

    const pagination = entity.discover.pagination;
    if (pagination?.type === "offset" && pagination.totalPath) {
        const total = dataValueAtPath(response, pagination.totalPath);
        if (!Number.isSafeInteger(total) || (total as number) < 0) {
            return null;
        }
        return { itemCount: discovered.length, items, total: total as number };
    }
    if (pagination?.type === "cursor") {
        const nextCursor = dataValueAtPath(response, pagination.nextCursorPath);
        if (nextCursor === null || nextCursor === undefined || nextCursor === "") {
            return { itemCount: discovered.length, items };
        }
        if (typeof nextCursor !== "string") {
            return null;
        }
        return { itemCount: discovered.length, items, nextCursor };
    }
    return { itemCount: discovered.length, items };
}

function scalarAtPath(value: unknown, path: string): string | number | undefined {
    const scalar = dataValueAtPath(value, path);
    if (typeof scalar === "string") {
        return scalar;
    }
    if (typeof scalar === "number" && Number.isFinite(scalar)) {
        return scalar;
    }
    return undefined;
}
