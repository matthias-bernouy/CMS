import type { PageRenderInputs, RenderablePage, RenderingSettings, TPage } from "@bernouy/cms-content/rendering";
import { CMS_CACHE_KEYS } from "@bernouy/cms-content/rendering";
import type { PageRenderMetadata } from "@bernouy/cms-content/seo";
import { cachedResponseAsync, sendCompressed } from "@bernouy/http-runner";
import type KernelCms from "cms-kernel/KernelCms";
import { makeRuntimeRenderContext } from "cms-kernel/html/runtimeContext";
import { renderPage } from "cms-kernel/html/renderPage";
import { preflightPageGatewayAccess, type PageAccess } from "./access/preflightPageGatewayAccess";
import { renderRef } from "./renderRef";
import { resolveRuntimePageIndexingMetadata } from "./resolvePageIndexing";
import { measureCurrentRequestTiming } from "@bernouy/http-runner/observability";

export async function serveRenderablePage(
    request: Request,
    renderable: RenderablePage,
    pathname: string,
    language: string,
    kernel: KernelCms,
    minimumAccess: PageAccess = "public",
    renderInputs?: PageRenderInputs,
): Promise<Response> {
    const decision = await measureCurrentRequestTiming("page_access", () =>
        preflightPageGatewayAccess(request, renderable, kernel, minimumAccess, renderInputs?.settings),
    );
    if (decision.response) {
        return decision.response;
    }
    const response = await renderIndexedPage(
        request,
        renderable.page,
        pathname,
        kernel,
        decision.access,
        language,
        decision.cacheable,
        decision.settings,
        renderInputs,
    );
    return embeddablePage(response, language, decision.access);
}

async function renderIndexedPage(
    request: Request,
    page: TPage,
    cachePath: string,
    kernel: KernelCms,
    access: PageAccess,
    language: string,
    cacheable: boolean,
    settings?: RenderingSettings,
    renderInputs?: PageRenderInputs,
): Promise<Response> {
    if (access !== "public") {
        return renderWithFallbacks(
            request,
            page,
            cachePath,
            kernel,
            false,
            { canonical: null, indexable: false, language },
            settings,
            renderInputs,
            true,
        );
    }
    const indexing = await measureCurrentRequestTiming("page_indexing", () =>
        resolveRuntimePageIndexingMetadata(request, page, kernel),
    );
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
    return renderWithFallbacks(
        request,
        page,
        cachePath,
        kernel,
        cacheable && !indexing.dynamic,
        { ...indexing.metadata, language },
        settings,
        renderInputs,
        !indexing.dynamic,
    );
}

async function renderWithFallbacks(
    request: Request,
    page: TPage,
    cachePath: string,
    kernel: KernelCms,
    cacheable: boolean,
    metadata: PageRenderMetadata,
    settings?: RenderingSettings,
    renderInputs?: PageRenderInputs,
    artifactCacheable = true,
): Promise<Response> {
    try {
        if (!artifactCacheable) {
            return sendCompressed(
                request,
                await measureCurrentRequestTiming("page_render", () =>
                    renderPage(
                        page,
                        makeRuntimeRenderContext(kernel, {
                            renderingSettings: settings,
                            pageRenderInputs: renderInputs,
                        }),
                        metadata,
                    ),
                ),
                "no-store",
                { skipCspHeader: true },
            );
        }
        const artifactRevision =
            renderInputs?.artifactRevision ??
            (await kernel.content.getRenderingRevision?.()) ??
            (await kernel.content.getContentRevision?.()) ??
            0;
        const renderingRevision = renderInputs?.renderingRevision ?? artifactRevision;
        const renderContext = makeRuntimeRenderContext(kernel, {
            renderingSettings: settings,
            contentRevision: renderingRevision,
            pageRenderInputs: renderInputs,
        });
        const cacheKey = `${CMS_CACHE_KEYS.page(cachePath)}:page:${page.id}:${page.revision}:language:${metadata.language ?? ""}:metadata:${JSON.stringify(metadata)}`;
        return cachedResponseAsync(
            request,
            artifactRevision ? `${cacheKey}:artifact:${artifactRevision}` : cacheKey,
            kernel.cache,
            () => measureCurrentRequestTiming("page_render", () => renderPage(page, renderContext, metadata)),
            cacheable ? "public, no-cache" : "private, no-store",
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

function embeddablePage(response: Response, language: string, access: PageAccess): Response {
    const headers = new Headers(response.headers);
    headers.set("Content-Language", language);
    headers.set("Content-Security-Policy", "frame-ancestors 'self'");
    headers.set("X-Frame-Options", "SAMEORIGIN");
    if (access !== "public") {
        headers.set("Cache-Control", "private, no-store");
        headers.set("X-Robots-Tag", "noindex, nofollow");
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}
