import type { TPage } from "@bernouy/cms-content";
import type { Source, SourceRepository } from "@bernouy/cms-sources";
import {
    type IndexingDiscoveryExecutor,
    iterateIndexingEntityItems,
    PageIndexingDiscoveryError,
} from "cms-delivery/core/seo/discoverIndexingEntityItems";

const MAX_SITEMAP_LOCATION_LENGTH = 2_048;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

export type PageIndexingLocation = {
    location: string;
    lastModified?: string;
};

export { PageIndexingDiscoveryError };

/** Discover canonical locations for every enabled entity-backed page. */
export async function discoverPageIndexingLocations(
    pages: readonly TPage[],
    sources: Pick<SourceRepository, "getSource"> | null | undefined,
    execute: IndexingDiscoveryExecutor | null | undefined,
): Promise<readonly PageIndexingLocation[]> {
    const locations = new Map<string, PageIndexingLocation>();
    for await (const location of iteratePageIndexingLocations(pages, sources, execute)) {
        const previous = locations.get(location.location);
        if (
            !previous ||
            (location.lastModified && (!previous.lastModified || location.lastModified > previous.lastModified))
        ) {
            locations.set(location.location, location);
        }
    }
    return [...locations.values()];
}

export async function* iteratePageIndexingLocations(
    pages: readonly TPage[],
    sources: Pick<SourceRepository, "getSource"> | null | undefined,
    execute: IndexingDiscoveryExecutor | null | undefined,
): AsyncGenerator<PageIndexingLocation> {
    const groups = indexingBindingGroups(pages);
    if (groups.length === 0) {
        return;
    }
    if (!sources || !execute) {
        throw new PageIndexingDiscoveryError("source runtime is not configured");
    }

    const sourceReads = new Map<string, Promise<Source | null>>();
    for (const group of groups) {
        const sourceRead = sourceReads.get(group.sourceUrn) ?? sources.getSource(group.sourceUrn);
        sourceReads.set(group.sourceUrn, sourceRead);
        const source = await sourceRead.catch(() => {
            throw new PageIndexingDiscoveryError("discovery source lookup failed");
        });
        const entity = source?.indexing?.entities.find(({ id }) => id === group.entityId);
        if (!entity || !source?.endpoints.some(({ urn }) => urn === entity.discover.endpointUrn)) {
            throw new PageIndexingDiscoveryError("configured discovery entity is unavailable");
        }

        for await (const item of iterateIndexingEntityItems(entity, execute)) {
            const lastModified = normalizeLastModified(item.lastModified);
            for (const page of group.pages) {
                const location = dynamicLocation(page.path, page.queryParam, item.identity);
                yield { location, ...(lastModified ? { lastModified } : {}) };
            }
        }
    }
}

type BindingGroup = {
    sourceUrn: string;
    entityId: string;
    pages: Array<{ path: string; queryParam: string }>;
};

function indexingBindingGroups(pages: readonly TPage[]): BindingGroup[] {
    const groups = new Map<string, BindingGroup>();
    for (const page of pages) {
        const binding = page.indexing?.enabled !== false ? page.indexing?.entity : undefined;
        if (!binding) {
            continue;
        }
        const key = JSON.stringify([binding.sourceUrn, binding.entityId]);
        const group = groups.get(key) ?? {
            sourceUrn: binding.sourceUrn,
            entityId: binding.entityId,
            pages: [],
        };
        group.pages.push({ path: page.path, queryParam: binding.pageQueryParam });
        groups.set(key, group);
    }
    return [...groups.values()];
}

function dynamicLocation(path: string, queryParam: string, identity: string | number): string {
    const search = new URLSearchParams([[queryParam, String(identity)]]).toString();
    const location = `${path}?${search}`;
    if (location.length > MAX_SITEMAP_LOCATION_LENGTH) {
        throw new PageIndexingDiscoveryError("discovered location is too long");
    }
    return location;
}

function normalizeLastModified(value: string | undefined): string | undefined {
    const candidate = value?.trim();
    if (!candidate || (!DATE_ONLY.test(candidate) && !DATE_TIME.test(candidate))) {
        return undefined;
    }
    const calendarDate = candidate.slice(0, 10);
    const calendar = new Date(`${calendarDate}T00:00:00Z`);
    if (!Number.isFinite(calendar.valueOf()) || calendar.toISOString().slice(0, 10) !== calendarDate) {
        return undefined;
    }
    const timestamp = Date.parse(DATE_ONLY.test(candidate) ? `${candidate}T00:00:00Z` : candidate);
    if (!Number.isFinite(timestamp)) {
        return undefined;
    }
    const normalized = new Date(timestamp).toISOString();
    if (DATE_ONLY.test(candidate)) {
        return normalized.slice(0, 10) === candidate ? candidate : undefined;
    }
    return normalized;
}
