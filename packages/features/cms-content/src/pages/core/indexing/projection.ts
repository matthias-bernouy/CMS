import type { PageIndexingConfiguration } from "cms-content/pages/interfaces/pages";

type Entity = NonNullable<PageIndexingConfiguration["entity"]>;

export type ProjectedIndexingDiscoveryItem = { identity: string | number; lastModified?: string };
export type ProjectedIndexingDiscoveryPage = {
    items: ProjectedIndexingDiscoveryItem[];
    itemCount: number;
    total?: number;
    nextCursor?: string;
};

/** Only declared fields become metadata or sitemap identities. */
export function projectResolvedIndexingEntity(
    entity: Entity,
    response: unknown,
): { identity: string | number; variables: Record<string, string | number> } | null {
    const identity = scalarAtPath(response, entity.resolve.identityPath);
    if (identity === undefined || identity === "") {
        return null;
    }
    const variables: Record<string, string | number> = {};
    for (const [name, variable] of Object.entries(entity.variables)) {
        const value = scalarAtPath(response, variable.path);
        if (
            (variable.type === "number" && typeof value === "number") ||
            (variable.type !== "number" && typeof value === "string")
        ) {
            variables[name] = value;
        }
    }
    return { identity, variables };
}

export function projectIndexingDiscoveryPage(entity: Entity, response: unknown): ProjectedIndexingDiscoveryPage | null {
    const definition = entity.discover;
    if (!definition) {
        return null;
    }
    const discovered = valueAtPath(response, definition.itemsPath);
    if (!Array.isArray(discovered)) {
        return null;
    }
    const items: ProjectedIndexingDiscoveryItem[] = [];
    for (const item of discovered) {
        const identity = scalarAtPath(item, definition.identityPath);
        if (identity === undefined || identity === "") {
            continue;
        }
        const lastModified = definition.lastModifiedPath ? valueAtPath(item, definition.lastModifiedPath) : undefined;
        items.push({ identity, ...(typeof lastModified === "string" && lastModified ? { lastModified } : {}) });
    }
    const pagination = definition.pagination;
    if (pagination?.type === "offset" && pagination.totalPath) {
        const total = valueAtPath(response, pagination.totalPath);
        if (!Number.isSafeInteger(total) || (total as number) < 0) {
            return null;
        }
        return { items, itemCount: discovered.length, total: total as number };
    }
    if (pagination?.type === "cursor") {
        const nextCursor = valueAtPath(response, pagination.nextCursorPath);
        if (nextCursor === null || nextCursor === undefined || nextCursor === "") {
            return { items, itemCount: discovered.length };
        }
        return typeof nextCursor === "string" ? { items, itemCount: discovered.length, nextCursor } : null;
    }
    return { items, itemCount: discovered.length };
}

function scalarAtPath(value: unknown, path: string): string | number | undefined {
    const scalar = valueAtPath(value, path);
    return typeof scalar === "string" || (typeof scalar === "number" && Number.isFinite(scalar)) ? scalar : undefined;
}

function valueAtPath(value: unknown, path: string): unknown {
    let current = value;
    for (const part of path.split(".")) {
        if (current === null || typeof current !== "object" || !Object.hasOwn(current, part)) {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}
