import type { RenderablePage, TPage } from "@bernouy/cms-content/rendering";
import { CMS_CACHE_KEYS } from "@bernouy/cms-content/rendering";
import type { PageRenderMetadata } from "@bernouy/cms-seo";
import { cachedResponseAsync, sendCompressed } from "@bernouy/http-runner";
import type KernelCms from "cms-kernel/KernelCms";
import { makeRuntimeRenderContext } from "cms-kernel/html/runtimeContext";
import { renderPage } from "cms-kernel/html/renderPage";
import { preflightPageGatewayAccess, type PageAccess } from "./access/preflightPageGatewayAccess";
import { renderRef } from "./renderRef";
import { resolveRuntimePageIndexingMetadata } from "./resolvePageIndexing";

export async function serveRenderablePage(
    request: Request,
    renderable: RenderablePage,
    pathname: string,
    language: string,
    kernel: KernelCms,
): Promise<Response> {
    const decision = await preflightPageGatewayAccess(request, renderable, kernel);
    if (decision.response) {
        return decision.response;
    }
    return renderIndexedPage(request, renderable.page, pathname, kernel, decision.access, language, decision.cacheable);
}

async function renderIndexedPage(
    request: Request,
    page: TPage,
    cachePath: string,
    kernel: KernelCms,
    access: PageAccess,
    language: string,
    cacheable: boolean,
): Promise<Response> {
    if (access !== "public") {
        return renderWithFallbacks(request, page, cachePath, kernel, false, {
            canonical: null,
            indexable: false,
            language,
        });
    }
    const indexing = await resolveRuntimePageIndexingMetadata(request, page, kernel);
    if (indexing.kind === "not-found") {
        return renderRef(request, kernel, "notFound", 404, "Page not found");
    }
    if (indexing.kind === "invalid-identity") {
        return new Response(indexing.status === 422 ? "Unprocessable Entity" : "Bad Request", {
            status: indexing.status,
            headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
        });
    }
    if (indexing.kind === "unavailable") {
        reportPageFailure(kernel, "indexing", cachePath, new Error(indexing.reason));
        return renderRef(request, kernel, "serverError", 503, "Service unavailable");
    }
    return renderWithFallbacks(request, page, cachePath, kernel, cacheable && !indexing.dynamic, {
        ...indexing.metadata,
        language,
    });
}

async function renderWithFallbacks(
    request: Request,
    page: TPage,
    cachePath: string,
    kernel: KernelCms,
    cacheable: boolean,
    metadata: PageRenderMetadata,
): Promise<Response> {
    try {
        if (!cacheable) {
            return sendCompressed(
                request,
                await renderPage(page, makeRuntimeRenderContext(kernel), metadata),
                "no-store",
                { skipCspHeader: true },
            );
        }
        const collectionRevision = (await kernel.content.getContentRevision?.()) ?? 0;
        const cacheKey = CMS_CACHE_KEYS.page(cachePath);
        return cachedResponseAsync(
            request,
            collectionRevision ? `${cacheKey}:collections:${collectionRevision}` : cacheKey,
            kernel.cache,
            () => renderPage(page, makeRuntimeRenderContext(kernel), metadata),
            kernel.content.getContentRevision ? "public, no-cache" : undefined,
            { skipCspHeader: true },
        );
    } catch (error) {
        reportPageFailure(kernel, "render", cachePath, error);
        return renderRef(request, kernel, "serverError", 500, "Internal server error");
    }
}

function reportPageFailure(
    kernel: KernelCms,
    operation: "indexing" | "render",
    pathname: string,
    error: unknown,
): void {
    kernel.logger.error("kernel.page.failed", { operation, pathname }, error);
}
