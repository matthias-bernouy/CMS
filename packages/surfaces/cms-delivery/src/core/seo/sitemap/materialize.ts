import { canonicalSiteBaseUrl, type TPage } from "@bernouy/cms-content";
import type { CmsFilesBlobStore } from "@bernouy/cms-files";
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

const ENCODER = new TextEncoder();

export type SitemapMaterializationResult = {
    status: "published" | "unchanged";
    snapshot: SitemapSnapshotDescriptor;
};

export async function materializeSitemapSnapshot(
    delivery: DeliveryCms,
    signal?: AbortSignal,
): Promise<SitemapMaterializationResult> {
    const store = delivery.sitemapStore;
    const settings = await delivery.repository.getSystem();
    const baseUrl = canonicalSiteBaseUrl(settings.site.host);
    if (!baseUrl) {
        throw new TypeError("canonical site host is not configured");
    }
    const request = new Request(`${baseUrl}/sitemap.xml`, {
        headers: { accept: "application/json" },
        signal,
    });
    const pages = await delivery.repository.getPublishedPages();
    const writer = new SitemapChunkWriter(store, baseUrl, signal);
    try {
        for (const entry of await storedSitemapLocations(delivery, pages)) {
            await writer.append(entry, delivery.cmsPathPrefix);
        }
        for await (const entry of iteratePageIndexingLocations(pages, delivery.sources, (endpointUrn, params) =>
            executeDeliverySourceGet(delivery, request, endpointUrn, params, {
                forwardAuthentication: false,
                forwardLanguage: false,
            }),
        )) {
            await writer.append(entry, delivery.cmsPathPrefix);
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
): Promise<PageIndexingLocation[]> {
    const providerPaths = await collectPublicPageProviderPaths(delivery.publicPageProviders, delivery.cmsPathPrefix);
    const blocked = new Set<string>();
    const locations: PageIndexingLocation[] = [];
    for (const page of pages) {
        if (page.indexing?.enabled === false || page.indexing?.entity) {
            blocked.add(page.path);
        } else {
            locations.push({ location: page.path });
        }
    }
    for (const path of providerPaths) {
        if (!blocked.has(path)) {
            locations.push({ location: path });
        }
    }
    return locations;
}

async function publishSnapshot(
    store: CmsFilesBlobStore,
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
        left.chunks.every((chunk, index) => chunk.hash === right.chunks[index]?.hash)
    );
}
