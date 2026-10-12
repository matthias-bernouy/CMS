import type KernelCms from "cms-kernel/KernelCms";
import { renderRef } from "cms-kernel/http/pages/renderRef";
import { serveRenderablePage } from "cms-kernel/http/pages/serveRenderablePage";

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

    const storedRoute = await kernel.content.resolveRenderableRoute(pathname);
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
    if (storedRoute?.kind === "current") {
        return serveRenderablePage(
            req,
            storedRoute.page,
            pathname,
            storedRoute.language ?? storedRoute.page.language ?? "en",
            kernel,
        );
    }

    return renderRef(req, kernel, "notFound", 404, "Page not found");
}
