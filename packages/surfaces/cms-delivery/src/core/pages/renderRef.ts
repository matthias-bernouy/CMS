import type DeliveryCms from "cms-delivery/DeliveryCms";
import { cachedResponseAsync, compress, sendCompressed } from "@bernouy/http-runner";
import { P9R_CACHE } from "@bernouy/cms-content";
import { renderPage } from "cms-delivery/core/html/renderPage";
import { makeRuntimeRenderContext } from "cms-delivery/core/html/runtimeContext";

const TEXT_FALLBACKS = new Map<string, ReturnType<typeof compress>>();

function textFallbackEntry(text: string) {
    let entry = TEXT_FALLBACKS.get(text);
    if (!entry) {
        entry = compress(text, "text/plain; charset=utf-8");
        TEXT_FALLBACKS.set(text, entry);
    }
    return entry;
}

/**
 * Render the configured fallback page for `site.notFound` / `site.serverError`
 * with the given HTTP status. Falls back to plain text when:
 *  - no ref is configured
 *  - the referenced page no longer exists
 *  - the fallback render itself throws (no recursion on errors)
 *
 * `renderPage` returns a pre-compressed `CacheEntry`; `sendCompressed` handles
 * negotiation, security headers and conditional requests.
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
            const page = await delivery.repository.getPublishedPage(ref.path);
            if (page) {
                return await cachedResponseAsync(
                    req,
                    P9R_CACHE.page(ref.path),
                    delivery.cache,
                    () => renderPage(page, makeRuntimeRenderContext(delivery)),
                    undefined,
                    { status, skipCspHeader: true },
                );
            }
        }
    } catch (err) {
        console.error(`Failed to render ${field} fallback:`, err);
    }
    return sendCompressed(req, textFallbackEntry(fallbackText), undefined, { status });
}
