import type ContentDeliveryHost from "cms-content/pages/delivery/interfaces";
import { isValidRegisteredPagePath } from "@bernouy/cms-content/page-path";
import { renderRef } from "cms-content/pages/delivery/http/pages/renderRef";
import { serveRenderablePage } from "cms-content/pages/delivery/http/pages/serveRenderablePage";
import { resolveRequestActor } from "cms-content/pages/delivery/http/pages/access/resolveRequestActor";
import type { PageRenderInputs } from "@bernouy/cms-content/rendering";

/**
 * Shared entry point for every public page GET registered by Content.
 * ContentReader is the only authority for published Pages. The HTTP adapter
 * maps route, access and rendering outcomes to responses and system fallbacks.
 */
export async function handlePageRequest(req: Request, delivery: ContentDeliveryHost): Promise<Response> {
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
        return serveRenderablePage(
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
}

async function pageRenderInputs(
    delivery: ContentDeliveryHost,
    pathname: string,
): Promise<PageRenderInputs | undefined> {
    return delivery.content.getPageRenderInputs?.(pathname);
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
