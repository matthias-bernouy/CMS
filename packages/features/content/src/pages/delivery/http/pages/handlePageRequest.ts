import { PageRenderInputsChanged } from "content/application/core/pageRenderInputs";
import type ContentDeliveryHost from "content/pages/delivery/interfaces";
import { isValidRegisteredPagePath } from "@bernouy/content/page-path";
import { renderRef } from "content/pages/delivery/http/pages/renderRef";
import { serveRenderablePage } from "content/pages/delivery/http/pages/serveRenderablePage";
import { resolveRequestActor } from "content/pages/delivery/http/pages/access/resolveRequestActor";
import type { PageRenderInputs, PageRenderPreparation } from "@bernouy/content/rendering";

/**
 * Shared entry point for every public page GET registered by Content.
 * ContentReader is the only authority for published Pages. The HTTP adapter
 * maps route, access and rendering outcomes to responses and system fallbacks.
 */
export function handlePageRequest(req: Request, delivery: ContentDeliveryHost): Promise<Response> {
    return servePageRequest(req, delivery, true);
}

async function servePageRequest(req: Request, delivery: ContentDeliveryHost, retry: boolean): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Short-circuit unknown asset URLs under Content's own prefix: they
    // reach the default handler because no specific route matched, and a
    // DB lookup would always miss.
    const prefix = delivery.cmsPathPrefix;
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
        return new Response("Not Found", { status: 404 });
    }
    if (!isValidRegisteredPagePath(pathname)) {
        return renderRef(req, delivery, "notFound", 404, "Page not found");
    }

    const renderInputs = await pageRenderInputs(delivery, pathname);
    try {
        const storedRoute = renderInputs?.route ?? (await delivery.content.resolveRenderableRoute(pathname));
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
            return serveEditorialRoute(req, pathname, delivery);
        }
        if (storedRoute?.kind === "redirect") {
            return new Response(null, {
                status: 301,
                headers: { Location: `${storedRoute.path}${url.search}`, "Cache-Control": "no-store" },
            });
        }
        if (storedRoute?.kind === "current") {
            return await serveRenderablePage(
                req,
                storedRoute.page,
                pathname,
                storedRoute.language ?? storedRoute.page.language ?? "en",
                delivery,
                "public",
                renderInputs,
            );
        }

        return renderRef(req, delivery, "notFound", 404, "Page not found");
    } catch (error) {
        if (!(error instanceof PageRenderInputsChanged)) {
            throw error;
        }
        if (retry) {
            return servePageRequest(req, delivery, false);
        }
        return new Response("Service unavailable", {
            status: 503,
            headers: { "cache-control": "no-store", "retry-after": "5" },
        });
    } finally {
        if (renderInputs && "close" in renderInputs) {
            renderInputs.close();
        }
    }
}

async function pageRenderInputs(
    delivery: ContentDeliveryHost,
    pathname: string,
): Promise<PageRenderInputs | PageRenderPreparation | undefined> {
    return delivery.content.preparePageRenderInputs?.(pathname) ?? delivery.content.getPageRenderInputs?.(pathname);
}

async function serveEditorialRoute(
    request: Request,
    pathname: string,
    delivery: ContentDeliveryHost,
): Promise<Response> {
    if (!delivery.editorialPages) {
        return renderRef(request, delivery, "notFound", 404, "Page not found");
    }
    const actor = await resolveRequestActor(delivery, request).catch(() => null);
    if (!actor) {
        return new Response("Service unavailable", {
            status: 503,
            headers: { "Cache-Control": "no-store" },
        });
    }
    if (actor.kind !== "administrator") {
        return renderRef(request, delivery, "notFound", 404, "Page not found");
    }
    let route: Awaited<ReturnType<NonNullable<typeof delivery.editorialPages>["resolveRoute"]>>;
    try {
        route = await delivery.editorialPages.resolveRoute(pathname);
    } catch (error) {
        delivery.logger.error("delivery.page.editorial-route.failed", { pathname }, error);
        return new Response("Service unavailable", {
            status: 503,
            headers: { "Cache-Control": "no-store" },
        });
    }
    if (!route) {
        return renderRef(request, delivery, "notFound", 404, "Page not found");
    }
    return serveRenderablePage(request, route.page, pathname, route.language, delivery, "admin");
}
