import type KernelCms from "cms-kernel/KernelCms";
import { isValidRegisteredPagePath } from "@bernouy/cms-content/page-path";
import { renderRef } from "cms-kernel/http/pages/renderRef";
import { serveRenderablePage } from "cms-kernel/http/pages/serveRenderablePage";
import { resolveRequestActor } from "cms-kernel/http/pages/access/resolveRequestActor";
import type { PageRenderInputs } from "@bernouy/cms-content/rendering";

/**
 * Shared entry point for every public page GET registered by Kernel.
 * ContentReader is the only authority for published Pages. The HTTP adapter
 * maps route, access and rendering outcomes to responses and system fallbacks.
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
    if (!isValidRegisteredPagePath(pathname)) {
        return renderRef(req, kernel, "notFound", 404, "Page not found");
    }

    const renderInputs = await pageRenderInputs(kernel, pathname);
    const storedRoute = renderInputs?.route ?? (await kernel.content.resolveRenderableRoute(pathname));
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
        return serveEditorialRoute(req, pathname, kernel);
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
            kernel,
            "public",
            renderInputs,
        );
    }

    return renderRef(req, kernel, "notFound", 404, "Page not found");
}

async function pageRenderInputs(kernel: KernelCms, pathname: string): Promise<PageRenderInputs | undefined> {
    return kernel.content.getPageRenderInputs?.(pathname);
}

async function serveEditorialRoute(request: Request, pathname: string, kernel: KernelCms): Promise<Response> {
    if (!kernel.editorialPages) {
        return renderRef(request, kernel, "notFound", 404, "Page not found");
    }
    const actor = await resolveRequestActor(kernel, request).catch(() => null);
    if (!actor) {
        return new Response("Service unavailable", {
            status: 503,
            headers: { "Cache-Control": "no-store" },
        });
    }
    if (actor.kind !== "administrator") {
        return renderRef(request, kernel, "notFound", 404, "Page not found");
    }
    let route: Awaited<ReturnType<NonNullable<typeof kernel.editorialPages>["resolveRoute"]>>;
    try {
        route = await kernel.editorialPages.resolveRoute(pathname);
    } catch (error) {
        kernel.logger.error("kernel.page.editorial-route.failed", { pathname }, error);
        return new Response("Service unavailable", {
            status: 503,
            headers: { "Cache-Control": "no-store" },
        });
    }
    if (!route) {
        return renderRef(request, kernel, "notFound", 404, "Page not found");
    }
    return serveRenderablePage(request, route.page, pathname, route.language, kernel, "admin");
}
