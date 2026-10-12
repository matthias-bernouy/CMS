import type KernelCms from "cms-kernel/KernelCms";
import type { TPage } from "@bernouy/cms-content/rendering";
import { cachedResponseAsync, sendCompressed } from "@bernouy/http-runner";
import { renderPage } from "cms-kernel/site/rendering/renderPage";
import { makeRuntimeRenderContext } from "cms-kernel/site/rendering/runtimeContext";
import { renderRef } from "cms-kernel/site/pages/renderRef";
import { CMS_CACHE_KEYS } from "@bernouy/cms-content/rendering";
import { preflightPageGatewayAccess } from "cms-kernel/site/pages/access/preflightPageGatewayAccess";
import type { PageAccess } from "cms-kernel/site/pages/access/preflightPageGatewayAccess";
import { publicPageCacheKey, resolvePublicPage } from "cms-kernel/site/pages/resolvePublicPage";
import { InvalidPublicPageRequestError } from "cms-kernel/site/pages/publicPageRequest";
import type { PageRenderMetadata } from "@bernouy/cms-seo";
import { resolveRuntimePageIndexingMetadata } from "cms-kernel/site/seo/runtimeIndexing";

/**
 * Shared entry point for every public page GET registered by Kernel.
 * ContentReader is authoritative for published CMS pages. Injected page
 * providers are fallback adapters for paths without a stored published page.
 * The selected page renders through the same pipeline and system fallbacks.
 *
 * Image optimization does NOT block the response. The first render serves the
 * page with original `<img>` sources and fire-and-forget enqueues variant
 * generation (`KernelCms.optimizePage` → `OptimizeQueue`, sharp off the
 * request path). When the worker finishes it invalidates the page cache, so the
 * responsive `srcset` only appears on a LATER render — the very first fetch
 * (often a CDN's) gets the un-enhanced page.
 */
export async function handlePageRequest(req: Request, kernel: KernelCms): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Short-circuit unknown asset URLs under Kernel's own prefix: they
    // reach the default handler because no specific route matched, and a
    // DB lookup would always miss.
    const prefix = kernel.cmsPathPrefix;
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
        return new Response("Not Found", { status: 404 });
    }

    const storedRoute = await kernel.repository.resolveRenderableRoute(pathname);
    if (storedRoute?.kind === "updating") {
        return new Response("Service unavailable", {
            status: 503,
            headers: { "Cache-Control": "no-store", "Retry-After": "5" },
        });
    }
    if (storedRoute?.kind === "gone") {
        return renderRef(req, kernel, "notFound", 410, "Page not found", storedRoute.language);
    }
    if (storedRoute?.kind === "unavailable") {
        return renderRef(req, kernel, "notFound", 404, "Page not found");
    }
    if (storedRoute?.kind === "redirect") {
        return new Response(null, {
            status: 301,
            headers: { Location: `${storedRoute.path}${url.search}`, "Cache-Control": "no-store" },
        });
    }
    const renderable = storedRoute?.kind === "current" ? storedRoute.page : null;
    if (renderable) {
        const sourceAccess = await preflightPageGatewayAccess(req, renderable.page, kernel, renderable.requirements);
        if (sourceAccess.response) {
            return sourceAccess.response;
        }

        return renderIndexedPage(
            req,
            renderable.page,
            pathname,
            kernel,
            null,
            200,
            sourceAccess.access,
            storedRoute?.language ?? renderable.language,
        );
    }

    let dynamicPage;
    try {
        dynamicPage = await resolvePublicPage(pathname, kernel, url.search);
    } catch (err) {
        if (err instanceof InvalidPublicPageRequestError) {
            return new Response("Bad Request", {
                status: err.status,
                headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
            });
        }
        reportPageFailure("resolve", pathname, err);
        return renderRef(req, kernel, "serverError", 500, "Internal server error");
    }

    if (dynamicPage) {
        const sourceAccess = await preflightPageGatewayAccess(req, dynamicPage.page, kernel);
        if (sourceAccess.response) {
            return sourceAccess.response;
        }
        const status = dynamicPage.status ?? 200;
        return renderIndexedPage(
            req,
            dynamicPage.page,
            pathname,
            kernel,
            status === 200 && !url.search ? dynamicPage.cacheIdentity : undefined,
            status,
            sourceAccess.access,
        );
    }

    return renderRef(req, kernel, "notFound", 404, "Page not found");
}

async function renderIndexedPage(
    req: Request,
    page: TPage,
    cachePath: string,
    kernel: KernelCms,
    publicCacheIdentity: string | undefined | null,
    status: number,
    access: PageAccess,
    language?: string,
): Promise<Response> {
    if (access !== "public") {
        return renderWithFallbacks(req, page, cachePath, kernel, undefined, status, {
            canonical: null,
            indexable: false,
            ...(language ? { language } : {}),
        });
    }
    const indexing = await resolveRuntimePageIndexingMetadata(req, page, kernel);
    if (indexing.kind === "not-found") {
        return renderRef(req, kernel, "notFound", 404, "Page not found");
    }
    if (indexing.kind === "invalid-identity") {
        return new Response(indexing.status === 422 ? "Unprocessable Entity" : "Bad Request", {
            status: indexing.status,
            headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
        });
    }
    if (indexing.kind === "unavailable") {
        reportPageFailure("indexing", cachePath, new Error(indexing.reason));
        return renderRef(req, kernel, "serverError", 503, "Service unavailable");
    }
    return renderWithFallbacks(
        req,
        page,
        cachePath,
        kernel,
        indexing.dynamic ? undefined : publicCacheIdentity,
        status,
        { ...indexing.metadata, ...(language ? { language } : {}) },
    );
}

async function renderWithFallbacks(
    req: Request,
    page: TPage,
    cachePath: string,
    kernel: KernelCms,
    publicCacheIdentity: string | undefined | null,
    status: number,
    metadata: PageRenderMetadata,
): Promise<Response> {
    try {
        if (publicCacheIdentity === undefined) {
            return withStatus(
                sendCompressed(req, await renderPage(page, makeRuntimeRenderContext(kernel), metadata), "no-store", {
                    skipCspHeader: true,
                }),
                status,
            );
        }
        const collectionRevision = (await kernel.repository.getContentRevision?.()) ?? 0;
        const cacheKey =
            publicCacheIdentity === null
                ? CMS_CACHE_KEYS.page(cachePath)
                : publicPageCacheKey(cachePath, publicCacheIdentity);
        return withStatus(
            await cachedResponseAsync(
                req,
                collectionRevision ? `${cacheKey}:collections:${collectionRevision}` : cacheKey,
                kernel.cache,
                () => renderPage(page, makeRuntimeRenderContext(kernel), metadata),
                publicCacheIdentity === null && !kernel.repository.getContentRevision ? undefined : "public, no-cache",
                { skipCspHeader: true },
            ),
            status,
        );
    } catch (err) {
        reportPageFailure("render", cachePath, err);
        return renderRef(req, kernel, "serverError", 500, "Internal server error");
    }
}

function withStatus(response: Response, status: number): Response {
    if (status === 200) {
        return response;
    }
    return new Response(response.body, { status, headers: response.headers });
}

function reportPageFailure(operation: "indexing" | "render" | "resolve", pathname: string, err: unknown): void {
    console.error("Kernel public page failure", {
        operation,
        pathname,
        errorType: err instanceof Error ? err.name : "UnknownError",
    });
}
