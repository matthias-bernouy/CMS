import { canonicalSiteBaseUrl, type ContentReader, type TPage } from "@bernouy/cms-content/rendering";
import type { BlobStore as SitemapStore } from "@bernouy/blob-store";
import {
    iteratePageIndexingLocations,
    type PageIndexingLocation,
} from "cms-seo/indexing/discoverPageIndexingLocations";
import type { IndexingDiscoveryExecutor } from "cms-seo/indexing/discoverIndexingEntityItems";
import {
    readSitemapManifest,
    SITEMAP_MANIFEST_KEY,
    SITEMAP_RETAINED_SNAPSHOTS,
    type SitemapManifest,
    type SitemapSnapshotDescriptor,
} from "./manifest";
import { deleteSitemapSnapshot, SitemapChunkWriter } from "./snapshotChunks";
import { localizedSitemapAlternates, localizedSitemapPages, withSitemapAlternates } from "./localizedPages";

const ENCODER = new TextEncoder();

export type SitemapMaterializationResult = {
    status: "published" | "unchanged";
    snapshot: SitemapSnapshotDescriptor;
};

export class CanonicalSiteHostNotConfiguredError extends TypeError {
    override name = "CanonicalSiteHostNotConfiguredError";

    constructor() {
        super("canonical site host is not configured");
    }
}

export class PrivateSiteNotIndexableError extends TypeError {
    override name = "PrivateSiteNotIndexableError";

    constructor() {
        super("private sites do not publish sitemap snapshots");
    }
}

export type SitemapMaterializationContext = {
    readonly store: SitemapStore;
    readonly content: Pick<ContentReader, "getRenderingSettings" | "getPublishedPages" | "resolvePublishedRoute">;
    readonly listAdditionalPaths: () => Promise<readonly string[]>;
    readonly isReservedPath: (path: string) => boolean;
    readonly execute: IndexingDiscoveryExecutor;
};

export async function materializeSitemapSnapshot(
    context: SitemapMaterializationContext,
    signal?: AbortSignal,
): Promise<SitemapMaterializationResult> {
    const { store } = context;
    const settings = await context.content.getRenderingSettings();
    if (!settings.site.visible) {
        throw new PrivateSiteNotIndexableError();
    }
    const baseUrl = canonicalSiteBaseUrl(settings.site.host);
    if (!baseUrl) {
        if (typeof settings.site.host === "string" && settings.site.host.trim()) {
            throw new TypeError("canonical site host is invalid");
        }
        throw new CanonicalSiteHostNotConfiguredError();
    }
    const published = await context.content.getPublishedPages();
    const pages = localizedSitemapPages(published, settings);
    const alternates = localizedSitemapAlternates(published, settings);
    const writer = new SitemapChunkWriter(store, baseUrl, signal);
    try {
        const additionalPaths = await context.listAdditionalPaths();
        for (const entry of await storedSitemapLocations(
            pages,
            additionalPaths,
            (path) => context.content.resolvePublishedRoute(path),
            alternates,
        )) {
            await writer.append(entry, context.isReservedPath);
        }
        for await (const entry of iteratePageIndexingLocations(pages, context.execute)) {
            await writer.append(withSitemapAlternates(entry, alternates), context.isReservedPath);
        }
        const snapshot = await writer.finish();
        return publishSnapshot(store, snapshot);
    } catch (error) {
        await writer.rollback();
        throw error;
    }
}

export async function storedSitemapLocations(
    pages: readonly TPage[],
    additionalPaths: readonly string[],
    resolvePublishedRoute: ContentReader["resolvePublishedRoute"],
    alternates?: ReturnType<typeof localizedSitemapAlternates>,
): Promise<PageIndexingLocation[]> {
    const blocked = new Set<string>();
    const locations: PageIndexingLocation[] = [];
    for (const page of pages) {
        if (page.indexing?.enabled === false || page.indexing?.entity) {
            blocked.add(page.path);
        } else {
            const entry = { location: page.path };
            locations.push(alternates ? withSitemapAlternates(entry, alternates) : entry);
        }
    }
    for (const path of additionalPaths) {
        if (!blocked.has(path) && !(await resolvePublishedRoute(path))) {
            locations.push({ location: path });
        }
    }
    return locations;
}

async function publishSnapshot(
    store: SitemapStore,
    snapshot: SitemapSnapshotDescriptor,
): Promise<SitemapMaterializationResult> {
    const previous = await readSitemapManifest(store);
    const current = previous?.snapshots[0];
    if (current && sameSnapshotContent(current, snapshot)) {
        await deleteSitemapSnapshot(store, snapshot);
        return { status: "unchanged", snapshot: current };
    }
    const retained = [snapshot, ...(previous?.snapshots ?? [])].slice(0, SITEMAP_RETAINED_SNAPSHOTS);
    const manifest: SitemapManifest = { version: 1, snapshots: retained };
    await store.put(SITEMAP_MANIFEST_KEY, ENCODER.encode(JSON.stringify(manifest)));
    const retainedIds = new Set(retained.map(({ id }) => id));
    for (const stale of previous?.snapshots ?? []) {
        if (!retainedIds.has(stale.id)) {
            await deleteSitemapSnapshot(store, stale).catch(() => undefined);
        }
    }
    return { status: "published", snapshot };
}

function sameSnapshotContent(left: SitemapSnapshotDescriptor, right: SitemapSnapshotDescriptor): boolean {
    return (
        left.publicBaseUrl === right.publicBaseUrl &&
        left.chunks.length === right.chunks.length &&
        left.chunks.every(
            (chunk, index) =>
                chunk.hash === right.chunks[index]?.hash && chunk.language === right.chunks[index]?.language,
        )
    );
}
