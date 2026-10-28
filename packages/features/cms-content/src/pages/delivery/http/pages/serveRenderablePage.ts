import { observeDelivery } from "cms-content/pages/delivery/observe";
import type { PageRenderInputs, RenderablePage, RenderingSettings, TPage } from "@bernouy/cms-content/rendering";
import { CMS_CACHE_KEYS } from "@bernouy/cms-content/rendering";
import type { PageRenderMetadata } from "@bernouy/cms-content/seo";
import { cachedResponseAsync, sendCompressed } from "@bernouy/http-runner";
import type ContentDeliveryHost from "cms-content/pages/delivery/interfaces";
import { makeRuntimeRenderContext } from "cms-content/pages/delivery/html/runtimeContext";
import { renderPage } from "cms-content/pages/delivery/html/renderPage";
import { preflightPageGatewayAccess, type PageAccess } from "./access/preflightPageGatewayAccess";
import { renderRef } from "./renderRef";
import { resolveRuntimePageIndexingMetadata } from "./resolvePageIndexing";
import { measureCurrentRequestTiming } from "@bernouy/http-runner/observability";

export async function serveRenderablePage(
    request: Request,
    renderable: RenderablePage,
    pathname: string,
    language: string,
    delivery: ContentDeliveryHost,
    minimumAccess: PageAccess = "public",
    renderInputs?: PageRenderInputs,
): Promise<Response> {
    const decision = await measureCurrentRequestTiming("page_access", () =>
        preflightPageGatewayAccess(request, renderable, delivery, minimumAccess, renderInputs?.settings),
    );
    if (decision.response) {
        return decision.response;
    }
    const response = await renderIndexedPage(
        request,
        renderable.page,
        pathname,
        delivery,
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
    delivery: ContentDeliveryHost,
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
            delivery,
            false,
            { canonical: null, indexable: false, language },
            settings,
            renderInputs,
            true,
        );
    }
    const indexing = await measureCurrentRequestTiming("page_indexing", () =>
        resolveRuntimePageIndexingMetadata(request, page, delivery),
    );
    if (indexing.kind === "not-found") {
        return renderRef(request, delivery, "notFound", 404, "Page not found");
    }
    if (indexing.kind === "invalid-identity") {
        return new Response(indexing.status === 422 ? "Unprocessable Entity" : "Bad Request", {
            status: indexing.status,
            headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
        });
    }
    if (indexing.kind === "unavailable") {
        reportPageFailure(delivery, "indexing", cachePath, new Error(indexing.reason));
        return renderRef(request, delivery, "serverError", 503, "Service unavailable");
    }
    return renderWithFallbacks(
        request,
        page,
        cachePath,
        delivery,
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
    delivery: ContentDeliveryHost,
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
                await observeDelivery(delivery, "page.render", () =>
                    renderPage(
                        page,
                        makeRuntimeRenderContext(delivery, {
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
            (await delivery.content.getRenderingRevision?.()) ??
            (await delivery.content.getContentRevision?.()) ??
            0;
        const renderingRevision = renderInputs?.renderingRevision ?? artifactRevision;
        const renderContext = makeRuntimeRenderContext(delivery, {
            renderingSettings: settings,
            contentRevision: renderingRevision,
            pageRenderInputs: renderInputs,
        });
        const cacheKey = `${CMS_CACHE_KEYS.page(cachePath)}:page:${page.id}:${page.revision}:language:${metadata.language ?? ""}:metadata:${JSON.stringify(metadata)}`;
        return cachedResponseAsync(
            request,
            artifactRevision ? `${cacheKey}:artifact:${artifactRevision}` : cacheKey,
            delivery.cache,
            () => observeDelivery(delivery, "page.render", () => renderPage(page, renderContext, metadata)),
            cacheable ? "public, no-cache" : "private, no-store",
            { skipCspHeader: true },
        );
    } catch (error) {
        reportPageFailure(delivery, "render", cachePath, error);
        return renderRef(request, delivery, "serverError", 500, "Internal server error");
    }
}

function reportPageFailure(
    delivery: ContentDeliveryHost,
    operation: "indexing" | "render",
    pathname: string,
    error: unknown,
): void {
    delivery.logger.error("delivery.page.failed", { operation, pathname }, error);
}

function embeddablePage(response: Response, language: string, access: PageAccess): Response {
    const headers = new Headers(response.headers);
    headers.set("Content-Language", language);
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
