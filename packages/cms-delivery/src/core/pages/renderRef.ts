import type DeliveryCms from "src/delivery/DeliveryCms";
import { renderPage } from "src/delivery/core/html/renderPage";
import { makeRuntimeRenderContext } from "src/delivery/core/html/runtimeContext";

/**
 * Render the configured fallback page for `site.notFound` / `site.serverError`
 * with the given HTTP status. Falls back to plain text when:
 *  - no ref is configured
 *  - the referenced page no longer exists
 *  - the fallback render itself throws (no recursion on errors)
 *
 * `renderPage` returns a pre-compressed `CacheEntry`, so we honour the
 * client's `accept-encoding` directly instead of going through
 * `sendCompressed` (which doesn't allow overriding the status code).
 */
export async function renderRef(
    req: Request,
    delivery: DeliveryCms,
    field: "notFound" | "serverError",
    status: number,
    fallbackText: string,
): Promise<Response> {
    try {
        const settings = await delivery.repository.getSystem();
        const ref = settings.site?.[field] ?? null;
        if (ref) {
            const page = await delivery.repository.getPage(ref.path);
            if (page) {
                const entry  = await renderPage(page, makeRuntimeRenderContext(delivery));
                const accept = req.headers.get("accept-encoding") || "";
                if (accept.includes("br")) {
                    return new Response(entry.brotli as BodyInit, {
                        status,
                        headers: {
                            "Content-Type":     entry.contentType,
                            "Content-Encoding": "br",
                        },
                    });
                }
                if (accept.includes("gzip")) {
                    return new Response(entry.gzip as BodyInit, {
                        status,
                        headers: {
                            "Content-Type":     entry.contentType,
                            "Content-Encoding": "gzip",
                        },
                    });
                }
                return new Response(entry.raw as BodyInit, {
                    status,
                    headers: { "Content-Type": entry.contentType },
                });
            }
        }
    } catch (err) {
        console.error(`Failed to render ${field} fallback:`, err);
    }
    return new Response(fallbackText, { status });
}
