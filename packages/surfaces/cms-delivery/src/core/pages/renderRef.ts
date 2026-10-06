import type DeliveryCms from "cms-delivery/DeliveryCms";
import { cachedResponseAsync, compress, sendCompressed } from "@bernouy/http-runner";
import { CMS_CACHE_KEYS } from "@bernouy/cms-content/rendering";
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
 * Render a configured system fallback page
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
    field: "notFound" | "forbidden" | "serverError",
    status: number,
    fallbackText: string,
    language?: string,
): Promise<Response> {
    try {
        const settings = await delivery.repository.getRenderingSettings();
        const ref = settings.site?.[field] ?? null;
        if (ref) {
            const page = await delivery.repository.getPublishedPageById(ref.pageId);
            if (page) {
                if (status === 410) {
                    return sendCompressed(
                        req,
                        await renderPage(page, makeRuntimeRenderContext(delivery), {
                            canonical: null,
                            indexable: false,
                            ...(language ? { language } : {}),
                        }),
                        "no-store",
                        { status, skipCspHeader: true },
                    );
                }
                const collectionRevision = (await delivery.repository.getCollectionRevision?.()) ?? 0;
                return await cachedResponseAsync(
                    req,
                    `${CMS_CACHE_KEYS.page(page.path)}:collections:${collectionRevision}`,
                    delivery.cache,
                    () => renderPage(page, makeRuntimeRenderContext(delivery)),
                    delivery.repository.getCollectionRevision ? "public, no-cache" : undefined,
                    { status, skipCspHeader: true },
                );
            }
        }
    } catch (err) {
        console.error(`Failed to render ${field} fallback:`, err);
    }
    return sendCompressed(req, textFallbackEntry(fallbackText), status === 410 ? "no-store" : undefined, { status });
}
