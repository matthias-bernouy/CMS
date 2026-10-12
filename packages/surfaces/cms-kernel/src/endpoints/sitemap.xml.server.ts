import type KernelCms from "cms-kernel/KernelCms";
import { canonicalSiteBaseUrl } from "@bernouy/cms-content/rendering";
import { compress, sendCompressed } from "@bernouy/http-runner";
import { isKernelReservedPath } from "cms-kernel/core/pages/publicPagePaths";
import { storedSitemapLocations } from "cms-kernel/core/seo/sitemap/materialize";
import { readSitemapManifest } from "cms-kernel/core/seo/sitemap/manifest";
import { MAX_SITEMAP_URLS_PER_CHUNK, sitemapIndexXml, staticSitemapXml } from "cms-kernel/core/seo/sitemap/xml";
import { localizedSitemapAlternates, localizedSitemapPages } from "cms-kernel/core/seo/sitemap/localizedPages";

export default async function SitemapServer(request: Request, kernel: KernelCms): Promise<Response> {
    try {
        const settings = await kernel.repository.getRenderingSettings();
        const publicBaseUrl = canonicalSiteBaseUrl(settings.site.host);
        if (!publicBaseUrl) {
            return new Response("Service Unavailable", {
                status: 503,
                headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
            });
        }
        const current = kernel.sitemapStoreOrNull
            ? (await readSitemapManifest(kernel.sitemapStoreOrNull))?.snapshots[0]
            : undefined;
        if (current?.publicBaseUrl === publicBaseUrl) {
            return sendCompressed(
                request,
                compress(sitemapIndexXml(current), "application/xml; charset=utf-8"),
                "public, no-cache",
            );
        }
        return await buildStaticFallback(request, kernel, publicBaseUrl);
    } catch (error) {
        console.error("Kernel sitemap failure", {
            errorType: error instanceof Error ? error.name : "UnknownError",
        });
        return new Response("Internal Server Error", {
            status: 500,
            headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
        });
    }
}

async function buildStaticFallback(request: Request, kernel: KernelCms, publicBaseUrl: string): Promise<Response> {
    const system = await kernel.repository.getRenderingSettings();
    const published = await kernel.repository.getPublishedPages();
    const pages = localizedSitemapPages(published, system);
    const candidates = await storedSitemapLocations(kernel, pages, localizedSitemapAlternates(published, system));
    const entries = [];
    const seen = new Set<string>();
    for (const entry of candidates) {
        if (seen.has(entry.location) || isKernelReservedPath(entry.location, kernel.cmsPathPrefix)) {
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
