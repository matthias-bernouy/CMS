import type DeliveryCms from "cms-delivery/DeliveryCms";
import type { TPage } from "@bernouy/cms-content";
import { cachedResponseAsync, sendCompressed } from "@bernouy/http-runner";
import { renderPage } from "cms-delivery/core/html/renderPage";
import { makeRuntimeRenderContext } from "cms-delivery/core/html/runtimeContext";
import { renderRef } from "cms-delivery/core/pages/renderRef";
import { P9R_CACHE } from "@bernouy/cms-content";
import { preflightPageSourceAccess } from "cms-delivery/core/pages/preflightPageSourceAccess";
import { publicPageCacheKey, resolvePublicPage } from "cms-delivery/core/pages/resolvePublicPage";
import { InvalidPublicPageRequestError } from "cms-delivery/core/pages/publicPageRequest";

/**
 * Shared entry point for every public page GET registered by Delivery.
 * Injected page providers are consulted before ContentReader. The selected
 * page renders through the same pipeline and system fallbacks as stored pages.
 *
 * Image optimization does NOT block the response. The first render serves the
 * page with original `<img>` sources and fire-and-forget enqueues variant
 * generation (`DeliveryCms.optimizePage` → `OptimizeQueue`, sharp off the
 * request path). When the worker finishes it invalidates the page cache, so the
 * responsive `srcset` only appears on a LATER render — the very first fetch
 * (often a CDN's) gets the un-enhanced page.
 */
export async function handlePageRequest(req: Request, delivery: DeliveryCms): Promise<Response> {
    return (await handlePageRequestWithResult(req, delivery)).response;
}

export type PageRequestResult = {
    response: Response;
    pageId?: string;
};

/** Internal variant used by analytics so stable page identity is not reconstructed from a path. */
export async function handlePageRequestWithResult(req: Request, delivery: DeliveryCms): Promise<PageRequestResult> {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Short-circuit unknown asset URLs under Delivery's own prefix: they
    // reach the default handler because no specific route matched, and a
    // DB lookup would always miss.
    const prefix = delivery.cmsPathPrefix;
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
        return { response: new Response("Not Found", { status: 404 }) };
    }

    let dynamicPage;
    try {
        dynamicPage = await resolvePublicPage(pathname, delivery, url.search);
    } catch (err) {
        if (err instanceof InvalidPublicPageRequestError) {
            return {
                response: new Response("Bad Request", {
                    status: err.status,
                    headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
                }),
            };
        }
        reportPageFailure("resolve", pathname, err);
        return { response: await renderRef(req, delivery, "serverError", 500, "Internal server error") };
    }

    if (dynamicPage) {
        const sourceAccess = await preflightPageSourceAccess(req, dynamicPage.page, delivery);
        if (sourceAccess) {
            return { response: sourceAccess, pageId: dynamicPage.page.id };
        }
        const status = dynamicPage.status ?? 200;
        return {
            response: await renderWithFallbacks(
                req,
                dynamicPage.page,
                pathname,
                delivery,
                status === 200 && !url.search ? dynamicPage.cacheIdentity : undefined,
                status,
            ),
            pageId: dynamicPage.page.id,
        };
    }

    const page = await delivery.repository.getPublishedPage(pathname);
    if (!page) {
        return { response: await renderRef(req, delivery, "notFound", 404, "Page not found") };
    }

    const sourceAccess = await preflightPageSourceAccess(req, page, delivery);
    if (sourceAccess) {
        return { response: sourceAccess, pageId: page.id };
    }

    return { response: await renderWithFallbacks(req, page, pathname, delivery, null, 200), pageId: page.id };
}

async function renderWithFallbacks(
    req: Request,
    page: TPage,
    cachePath: string,
    delivery: DeliveryCms,
    publicCacheIdentity: string | undefined | null,
    status: number,
): Promise<Response> {
    try {
        if (publicCacheIdentity === undefined) {
            return withStatus(
                sendCompressed(req, await renderPage(page, makeRuntimeRenderContext(delivery)), "no-store", {
                    skipCspHeader: true,
                }),
                status,
            );
        }
        const cacheKey =
            publicCacheIdentity === null
                ? P9R_CACHE.page(cachePath)
                : publicPageCacheKey(cachePath, publicCacheIdentity);
        return withStatus(
            await cachedResponseAsync(
                req,
                cacheKey,
                delivery.cache,
                () => renderPage(page, makeRuntimeRenderContext(delivery)),
                publicCacheIdentity === null ? undefined : "public, no-cache",
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

function reportPageFailure(operation: "render" | "resolve", pathname: string, err: unknown): void {
    console.error("Delivery public page failure", {
        operation,
        pathname,
        errorType: err instanceof Error ? err.name : "UnknownError",
    });
}
