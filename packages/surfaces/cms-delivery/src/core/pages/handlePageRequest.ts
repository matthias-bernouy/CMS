import type DeliveryCms from "cms-delivery/DeliveryCms";
import type { TPage } from "@bernouy/cms-content/rendering";
import { cachedResponseAsync, sendCompressed } from "@bernouy/http-runner";
import { renderPage } from "cms-delivery/core/html/renderPage";
import { makeRuntimeRenderContext } from "cms-delivery/core/html/runtimeContext";
import { renderRef } from "cms-delivery/core/pages/renderRef";
import { P9R_CACHE } from "@bernouy/cms-content/rendering";
import { preflightPageGatewayAccess } from "cms-delivery/core/pages/preflightPageGatewayAccess";
import { publicPageCacheKey, resolvePublicPage } from "cms-delivery/core/pages/resolvePublicPage";
import { InvalidPublicPageRequestError } from "cms-delivery/core/pages/publicPageRequest";
import type { PageRenderMetadata } from "cms-delivery/core/seo/pageMetadata";
import { resolveRuntimePageIndexingMetadata } from "cms-delivery/core/seo/indexing/resolveRuntimePageIndexingMetadata";

/**
 * Shared entry point for every public page GET registered by Delivery.
 * ContentReader is authoritative for published CMS pages. Injected page
 * providers are fallback adapters for paths without a stored published page.
 * The selected page renders through the same pipeline and system fallbacks.
 *
 * Image optimization does NOT block the response. The first render serves the
 * page with original `<img>` sources and fire-and-forget enqueues variant
 * generation (`DeliveryCms.optimizePage` → `OptimizeQueue`, sharp off the
 * request path). When the worker finishes it invalidates the page cache, so the
 * responsive `srcset` only appears on a LATER render — the very first fetch
 * (often a CDN's) gets the un-enhanced page.
 */
export async function handlePageRequest(req: Request, delivery: DeliveryCms): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Short-circuit unknown asset URLs under Delivery's own prefix: they
    // reach the default handler because no specific route matched, and a
    // DB lookup would always miss.
    const prefix = delivery.cmsPathPrefix;
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
        return new Response("Not Found", { status: 404 });
    }

    const storedRoute = await delivery.repository.resolvePublishedRoute(pathname);
    if (storedRoute?.kind === "updating") {
        return new Response("Service unavailable", {
            status: 503,
            headers: { "Cache-Control": "no-store", "Retry-After": "5" },
        });
    }
    if (storedRoute?.kind === "gone") {
        return renderRef(req, delivery, "notFound", 410, "Page not found", storedRoute.language);
    }
    if (storedRoute?.kind === "unavailable") {
        return renderRef(req, delivery, "notFound", 404, "Page not found");
    }
    if (storedRoute?.kind === "redirect") {
        return new Response(null, {
            status: 301,
            headers: { Location: `${storedRoute.path}${url.search}`, "Cache-Control": "no-store" },
        });
    }
    const page =
        storedRoute?.kind === "current" ? storedRoute.page : await delivery.repository.getPublishedPage(pathname);
    if (page) {
        const sourceAccess = await preflightPageGatewayAccess(req, page, delivery);
        if (sourceAccess) {
            return sourceAccess;
        }

        return renderIndexedPage(req, page, pathname, delivery, null, 200, storedRoute?.language);
    }

    let dynamicPage;
    try {
        dynamicPage = await resolvePublicPage(pathname, delivery, url.search);
    } catch (err) {
        if (err instanceof InvalidPublicPageRequestError) {
            return new Response("Bad Request", {
                status: err.status,
                headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
            });
        }
        reportPageFailure("resolve", pathname, err);
        return renderRef(req, delivery, "serverError", 500, "Internal server error");
    }

    if (dynamicPage) {
        const sourceAccess = await preflightPageGatewayAccess(req, dynamicPage.page, delivery);
        if (sourceAccess) {
            return sourceAccess;
        }
        const status = dynamicPage.status ?? 200;
        return renderIndexedPage(
            req,
            dynamicPage.page,
            pathname,
            delivery,
            status === 200 && !url.search ? dynamicPage.cacheIdentity : undefined,
            status,
        );
    }

    return renderRef(req, delivery, "notFound", 404, "Page not found");
}

async function renderIndexedPage(
    req: Request,
    page: TPage,
    cachePath: string,
    delivery: DeliveryCms,
    publicCacheIdentity: string | undefined | null,
    status: number,
    language?: string,
): Promise<Response> {
    const indexing = await resolveRuntimePageIndexingMetadata(req, page, delivery);
    if (indexing.kind === "not-found") {
        return renderRef(req, delivery, "notFound", 404, "Page not found");
    }
    if (indexing.kind === "invalid-identity") {
        return new Response(indexing.status === 422 ? "Unprocessable Entity" : "Bad Request", {
            status: indexing.status,
            headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
        });
    }
    if (indexing.kind === "unavailable") {
        reportPageFailure("indexing", cachePath, new Error(indexing.reason));
        return renderRef(req, delivery, "serverError", 503, "Service unavailable");
    }
    return renderWithFallbacks(
        req,
        page,
        cachePath,
        delivery,
        indexing.dynamic ? undefined : publicCacheIdentity,
        status,
        { ...indexing.metadata, ...(language ? { language } : {}) },
    );
}

async function renderWithFallbacks(
    req: Request,
    page: TPage,
    cachePath: string,
    delivery: DeliveryCms,
    publicCacheIdentity: string | undefined | null,
    status: number,
    metadata: PageRenderMetadata,
): Promise<Response> {
    try {
        if (publicCacheIdentity === undefined) {
            return withStatus(
                sendCompressed(req, await renderPage(page, makeRuntimeRenderContext(delivery), metadata), "no-store", {
                    skipCspHeader: true,
                }),
                status,
            );
        }
        const collectionRevision = (await delivery.repository.getCollectionRevision?.()) ?? 0;
        const cacheKey =
            publicCacheIdentity === null
                ? P9R_CACHE.page(cachePath)
                : publicPageCacheKey(cachePath, publicCacheIdentity);
        return withStatus(
            await cachedResponseAsync(
                req,
                collectionRevision ? `${cacheKey}:collections:${collectionRevision}` : cacheKey,
                delivery.cache,
                () => renderPage(page, makeRuntimeRenderContext(delivery), metadata),
                publicCacheIdentity === null && !delivery.repository.getCollectionRevision
                    ? undefined
                    : "public, no-cache",
                { skipCspHeader: true },
            ),
            status,
        );
    } catch (err) {
        reportPageFailure("render", cachePath, err);
        return renderRef(req, delivery, "serverError", 500, "Internal server error");
    }
}

function withStatus(response: Response, status: number): Response {
    if (status === 200) {
        return response;
    }
    return new Response(response.body, { status, headers: response.headers });
}

function reportPageFailure(operation: "indexing" | "render" | "resolve", pathname: string, err: unknown): void {
    console.error("Delivery public page failure", {
        operation,
        pathname,
        errorType: err instanceof Error ? err.name : "UnknownError",
    });
}
