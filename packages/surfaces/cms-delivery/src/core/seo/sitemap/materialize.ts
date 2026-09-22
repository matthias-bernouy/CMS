import { canonicalSiteBaseUrl, type TPage } from "@bernouy/cms-content/rendering";
import type { SitemapStore } from "@bernouy/cms-content/files/serving";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { collectPublicPageProviderPaths } from "cms-delivery/core/pages/publicPagePaths";
import {
    iteratePageIndexingLocations,
    type PageIndexingLocation,
} from "cms-delivery/core/seo/discoverPageIndexingLocations";
import { executeDeliverySourceGet } from "cms-delivery/core/sources/executeDeliverySourceGet";
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

export async function materializeSitemapSnapshot(
    delivery: DeliveryCms,
    signal?: AbortSignal,
): Promise<SitemapMaterializationResult> {
    const store = delivery.sitemapStore;
    const settings = await delivery.repository.getRenderingSettings();
    const baseUrl = canonicalSiteBaseUrl(settings.site.host);
    if (!baseUrl) {
        if (typeof settings.site.host === "string" && settings.site.host.trim()) {
            throw new TypeError("canonical site host is invalid");
        }
        throw new CanonicalSiteHostNotConfiguredError();
    }
    const request = new Request(`${baseUrl}/sitemap.xml`, {
        headers: { accept: "application/json" },
        signal,
    });
    const published = await delivery.repository.getPublishedPages();
    const pages = localizedSitemapPages(published, settings);
    const alternates = localizedSitemapAlternates(published, settings);
    const writer = new SitemapChunkWriter(store, baseUrl, signal);
    try {
        for (const entry of await storedSitemapLocations(delivery, pages, alternates)) {
            await writer.append(entry, delivery.cmsPathPrefix);
        }
        for await (const entry of iteratePageIndexingLocations(pages, delivery.sources, (endpointUrn, params) =>
            executeDeliverySourceGet(delivery, request, endpointUrn, params, {
                forwardAuthentication: false,
                forwardLanguage: false,
            }),
        )) {
            await writer.append(withSitemapAlternates(entry, alternates), delivery.cmsPathPrefix);
        }
        const snapshot = await writer.finish();
        return publishSnapshot(store, snapshot);
    } catch (error) {
        await writer.rollback();
        throw error;
    }
}

export async function storedSitemapLocations(
    delivery: DeliveryCms,
    pages: readonly TPage[],
    alternates?: ReturnType<typeof localizedSitemapAlternates>,
): Promise<PageIndexingLocation[]> {
    const providerPaths = await collectPublicPageProviderPaths(delivery.publicPageProviders, delivery.cmsPathPrefix);
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
    for (const path of providerPaths) {
        if (!blocked.has(path) && !(await delivery.repository.resolvePublishedRoute(path))) {
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
