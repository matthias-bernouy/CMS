import type { BlobStore } from "@bernouy/blob-store";
import { canonicalSiteBaseUrl, type ContentReader } from "@bernouy/cms-content/rendering";
import { compress, sendCompressed } from "@bernouy/http-runner";
import { localizedSitemapAlternates, localizedSitemapPages } from "cms-seo/sitemap/localizedPages";
import { MAX_SITEMAP_URLS_PER_CHUNK, sitemapIndexXml, staticSitemapXml } from "cms-seo/sitemap/xml";
import { readSitemapManifest } from "cms-seo/sitemap/manifest";
import type { Logger } from "@bernouy/logging";
import { storedSitemapLocations } from "cms-seo/sitemap/materialize";

export type SitemapHandlerConfig = {
    content: Pick<ContentReader, "getRenderingSettings" | "getPublishedPages" | "resolvePublishedRoute">;
    store?: BlobStore;
    isReservedPath(path: string): boolean;
    logger: Logger;
};

export function createSitemapHandler(config: SitemapHandlerConfig) {
    return async (request: Request): Promise<Response> => {
        try {
            const settings = await config.content.getRenderingSettings();
            if (!settings.site.visible) {
                return new Response("Not Found", {
                    status: 404,
                    headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
                });
            }
            const publicBaseUrl = canonicalSiteBaseUrl(settings.site.host);
            if (!publicBaseUrl) {
                return unavailable();
            }
            const current = config.store ? (await readSitemapManifest(config.store))?.snapshots[0] : undefined;
            if (current?.publicBaseUrl === publicBaseUrl) {
                return sendCompressed(
                    request,
                    compress(sitemapIndexXml(current), "application/xml; charset=utf-8"),
                    "public, no-cache",
                );
            }
            return buildStaticFallback(request, config, publicBaseUrl);
        } catch (error) {
            config.logger.error("seo.sitemap.failed", {}, error);
            return new Response("Internal Server Error", {
                status: 500,
                headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
            });
        }
    };
}

async function buildStaticFallback(request: Request, config: SitemapHandlerConfig, publicBaseUrl: string) {
    const settings = await config.content.getRenderingSettings();
    const published = await config.content.getPublishedPages();
    const pages = localizedSitemapPages(published, settings);
    const candidates = await storedSitemapLocations(
        pages,
        [],
        (path) => config.content.resolvePublishedRoute(path),
        localizedSitemapAlternates(published, settings),
    );
    const entries = [];
    const seen = new Set<string>();
    for (const entry of candidates) {
        if (seen.has(entry.location) || config.isReservedPath(entry.location)) {
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

function unavailable(): Response {
    return new Response("Service Unavailable", {
        status: 503,
        headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
    });
}
