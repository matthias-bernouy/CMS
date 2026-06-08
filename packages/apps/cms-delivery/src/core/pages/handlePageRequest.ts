import type DeliveryCms from "cms-delivery/DeliveryCms";
import type { TPage } from "@bernouy/cms-shared";
import { cachedResponseAsync } from "@bernouy/cms-shared";
import { renderPage } from "cms-delivery/core/html/renderPage";
import { makeRuntimeRenderContext } from "cms-delivery/core/html/runtimeContext";
import { renderRef } from "cms-delivery/core/pages/renderRef";
import { P9R_CACHE } from "@bernouy/cms-shared";

/**
 * Shared entry point for every dynamic page GET registered by Delivery.
 * Looks the page up by URL path, renders through the cache, and falls back
 * to `site.notFound` / `site.serverError` on miss or render failure.
 *
 * On a cold cache hit the request blocks on page enhancement before
 * returning — Playwright measures the page at every viewport, rewrites
 * `<img>` tags, and replaces the cached entry. The caller (often a CDN)
 * therefore sees the enhanced HTML on its very first fetch rather than
 * caching the un-enhanced first pass for the duration of its TTL.
 */
export async function handlePageRequest(req: Request, delivery: DeliveryCms): Promise<Response> {
    const pathname = new URL(req.url).pathname;

    // Short-circuit unknown asset URLs under Delivery's own prefix: they
    // reach the default handler because no specific route matched, and a
    // DB lookup would always miss.
    const prefix = delivery.cmsPathPrefix;
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
        return new Response("Not Found", { status: 404 });
    }

    // Drafts (`visible: false`) live in the same store as published pages —
    // the shared repository can't filter them (the admin needs unfiltered
    // access for path-collision checks), so Delivery gates publication here.
    // A draft is indistinguishable from a missing page to the public.
    const page = await delivery.repository.getPage(pathname);
    if (!page || !page.visible) return renderRef(req, delivery, "notFound", 404, "Page not found");

    return renderWithFallbacks(req, page, pathname, delivery);
}

async function renderWithFallbacks(
    req: Request,
    page: TPage,
    cachePath: string,
    delivery: DeliveryCms,
): Promise<Response> {
    const cacheKey = P9R_CACHE.page(cachePath);

    try {
        return await cachedResponseAsync(
            req,
            cacheKey,
            delivery.cache,
            () => renderPage(page, makeRuntimeRenderContext(delivery)),
            undefined,
            { skipCspHeader: true },
        );
    } catch (err) {
        console.error(`Failed to render page ${cachePath}:`, err);
        return renderRef(req, delivery, "serverError", 500, "Internal server error");
    }
}
