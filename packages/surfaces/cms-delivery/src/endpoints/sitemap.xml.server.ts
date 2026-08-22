import type DeliveryCms from "cms-delivery/DeliveryCms";
import { canonicalSiteBaseUrl } from "@bernouy/cms-content";
import { compress, sendCompressed } from "@bernouy/http-runner";
import { isDeliveryReservedPath } from "cms-delivery/core/pages/publicPagePaths";
import { storedSitemapLocations } from "cms-delivery/core/seo/sitemap/materialize";
import { readSitemapManifest } from "cms-delivery/core/seo/sitemap/manifest";
import { MAX_SITEMAP_URLS_PER_CHUNK, sitemapIndexXml, staticSitemapXml } from "cms-delivery/core/seo/sitemap/xml";

export default async function SitemapServer(request: Request, delivery: DeliveryCms): Promise<Response> {
    try {
        const settings = await delivery.repository.getSystem();
        const publicBaseUrl = canonicalSiteBaseUrl(settings.site.host);
        if (!publicBaseUrl) {
            return new Response("Service Unavailable", {
                status: 503,
                headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
            });
        }
        const current = delivery.sitemapStoreOrNull
            ? (await readSitemapManifest(delivery.sitemapStoreOrNull))?.snapshots[0]
            : undefined;
        if (current?.publicBaseUrl === publicBaseUrl) {
            return sendCompressed(
                request,
                compress(sitemapIndexXml(current), "application/xml; charset=utf-8"),
                "public, no-cache",
            );
        }
        return await buildStaticFallback(request, delivery, publicBaseUrl);
    } catch (error) {
        console.error("Delivery sitemap failure", {
            errorType: error instanceof Error ? error.name : "UnknownError",
        });
        return new Response("Internal Server Error", {
            status: 500,
            headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
        });
    }
}

async function buildStaticFallback(request: Request, delivery: DeliveryCms, publicBaseUrl: string): Promise<Response> {
    const pages = await delivery.repository.getPublishedPages();
    const candidates = await storedSitemapLocations(delivery, pages);
    const entries = [];
    const seen = new Set<string>();
    for (const entry of candidates) {
        if (seen.has(entry.location) || isDeliveryReservedPath(entry.location, delivery.cmsPathPrefix)) {
            continue;
        }
        if (entries.length >= MAX_SITEMAP_URLS_PER_CHUNK) {
            throw new RangeError("static sitemap fallback URL limit exceeded");
        }
        seen.add(entry.location);
        entries.push(entry);
    }
    return sendCompressed(
        request,
        compress(staticSitemapXml(publicBaseUrl, entries), "application/xml; charset=utf-8"),
        "public, no-cache",
    );
}
