import {
    projectIndexingDiscoveryPage,
    type ProjectedIndexingDiscoveryItem,
    type SourceIndexingEntity,
} from "@bernouy/cms-sources";

const MAX_DISCOVERY_ITEMS = 5_000_000;
const MAX_DISCOVERY_REQUESTS = 100_001;

export type IndexingDiscoveryExecutor = (
    endpointUrn: string,
    params: Readonly<Record<string, string | number>>,
) => Promise<Response>;

export class PageIndexingDiscoveryError extends Error {
    override name = "PageIndexingDiscoveryError";
}

export async function discoverIndexingEntityItems(
    entity: SourceIndexingEntity,
    execute: IndexingDiscoveryExecutor,
): Promise<ProjectedIndexingDiscoveryItem[]> {
    const items: ProjectedIndexingDiscoveryItem[] = [];
    for await (const item of iterateIndexingEntityItems(entity, execute)) {
        items.push(item);
    }
    return items;
}

export async function* iterateIndexingEntityItems(
    entity: SourceIndexingEntity,
    execute: IndexingDiscoveryExecutor,
): AsyncGenerator<ProjectedIndexingDiscoveryItem> {
    const pagination = entity.discover.pagination;
    const seenCursors = new Set<string>();
    let offset = 0;
    let cursor: string | undefined;
    let previousPageSignature: string | undefined;
    let discoveredCount = 0;

    for (let requestIndex = 0; requestIndex < MAX_DISCOVERY_REQUESTS; requestIndex += 1) {
        const params: Record<string, string | number> = {};
        if (pagination?.type === "offset") {
            params[pagination.limitParam] = pagination.pageSize;
            params[pagination.offsetParam] = offset;
        } else if (pagination?.type === "cursor") {
            if (pagination.limitParam && pagination.pageSize !== undefined) {
                params[pagination.limitParam] = pagination.pageSize;
            }
            if (cursor !== undefined) {
                params[pagination.cursorParam] = cursor;
            }
        }

        const projected = await executeDiscoveryPage(entity, params, execute);
        const signature = JSON.stringify(projected.items.map(({ identity }) => identity));
        if (requestIndex > 0 && projected.itemCount > 0 && signature === previousPageSignature) {
            throw new PageIndexingDiscoveryError("discovery pagination did not advance");
        }
        previousPageSignature = signature;
        discoveredCount += projected.itemCount;
        if (discoveredCount > MAX_DISCOVERY_ITEMS) {
            throw new PageIndexingDiscoveryError("discovery item limit exceeded");
        }
        for (const item of projected.items) {
            yield item;
        }

        if (!pagination) {
            return;
        }
        if (pagination.type === "offset") {
            if (projected.total !== undefined && offset + projected.itemCount >= projected.total) {
                return;
            }
            if (projected.itemCount === 0) {
                if (projected.total === undefined) {
                    return;
                }
                throw new PageIndexingDiscoveryError("discovery ended before its declared total");
            }
            if (projected.total === undefined && projected.itemCount < pagination.pageSize) {
                return;
            }
            offset += projected.itemCount;
            continue;
        }
        if (!projected.nextCursor) {
            return;
        }
        if (seenCursors.has(projected.nextCursor)) {
            throw new PageIndexingDiscoveryError("discovery cursor repeated");
        }
        seenCursors.add(projected.nextCursor);
        cursor = projected.nextCursor;
    }
    throw new PageIndexingDiscoveryError("discovery request limit exceeded");
}

async function executeDiscoveryPage(
    entity: SourceIndexingEntity,
    params: Readonly<Record<string, string | number>>,
    execute: IndexingDiscoveryExecutor,
) {
    let response: Response;
    try {
        response = await execute(entity.discover.endpointUrn, params);
    } catch {
        throw new PageIndexingDiscoveryError("discovery request failed");
    }
    if (!response.ok) {
        await discardResponseBody(response);
        throw new PageIndexingDiscoveryError(`discovery endpoint returned ${response.status}`);
    }
    try {
        const projected = projectIndexingDiscoveryPage(entity, await response.json());
        if (!projected) {
            throw new PageIndexingDiscoveryError("discovery response does not match its contract");
        }
        return projected;
    } catch (error) {
        if (error instanceof PageIndexingDiscoveryError) {
            throw error;
        }
        throw new PageIndexingDiscoveryError("discovery response is not valid JSON");
    }
}

async function discardResponseBody(response: Response): Promise<void> {
    try {
        await response.body?.cancel();
    } catch {
        // The discarded response may already have failed while streaming.
    }
}
