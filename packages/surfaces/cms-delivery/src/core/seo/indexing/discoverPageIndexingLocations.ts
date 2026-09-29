import type { TPage } from "@bernouy/cms-content/rendering";
import {
    type IndexingDiscoveryExecutor,
    iterateIndexingEntityItems,
    PageIndexingDiscoveryError,
} from "cms-delivery/core/seo/indexing/discoverIndexingEntityItems";

const MAX_SITEMAP_LOCATION_LENGTH = 2_048;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

export type PageIndexingLocation = {
    location: string;
    lastModified?: string;
    language?: string;
    alternates?: readonly { language: string; location: string }[];
};

export { PageIndexingDiscoveryError };

/** Discover canonical locations for every enabled entity-backed page. */
export async function discoverPageIndexingLocations(
    pages: readonly TPage[],
    execute: IndexingDiscoveryExecutor | null | undefined,
): Promise<readonly PageIndexingLocation[]> {
    const locations = new Map<string, PageIndexingLocation>();
    for await (const location of iteratePageIndexingLocations(pages, execute)) {
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
    execute: IndexingDiscoveryExecutor | null | undefined,
): AsyncGenerator<PageIndexingLocation> {
    const groups = indexingBindingGroups(pages);
    if (groups.length === 0) {
        return;
    }
    if (!execute) {
        throw new PageIndexingDiscoveryError("gateway runtime is not configured");
    }
    for (const group of groups) {
        for await (const item of iterateIndexingEntityItems(group.entity, execute)) {
            const lastModified = normalizeLastModified(item.lastModified);
            for (const page of group.pages) {
                const location = dynamicLocation(page.path, page.queryParam, item.identity);
                yield { location, ...(lastModified ? { lastModified } : {}) };
            }
        }
    }
}

type BindingGroup = {
    entity: NonNullable<NonNullable<TPage["indexing"]>["entity"]>;
    pages: Array<{ path: string; queryParam: string }>;
};

function indexingBindingGroups(pages: readonly TPage[]): BindingGroup[] {
    const groups = new Map<string, BindingGroup>();
    for (const page of pages) {
        const binding = page.indexing?.enabled !== false ? page.indexing?.entity : undefined;
        if (!binding) {
            continue;
        }
        if (!binding.discover) {
            continue;
        }
        const key = JSON.stringify({ ...binding, pageQueryParam: "" });
        const group = groups.get(key) ?? {
            entity: binding,
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
