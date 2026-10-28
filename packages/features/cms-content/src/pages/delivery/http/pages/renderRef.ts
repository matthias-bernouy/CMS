import { pageRequiresCapabilityAnalysis } from "cms-content/pages/delivery/access/PageCapabilityAnalyzer";
import type ContentDeliveryHost from "cms-content/pages/delivery/interfaces";
import { cachedResponseAsync, compress, sendCompressed } from "@bernouy/http-runner";
import { CMS_CACHE_KEYS } from "@bernouy/cms-content/rendering";
import { renderPage } from "cms-content/pages/delivery/html/renderPage";
import { makeRuntimeRenderContext } from "cms-content/pages/delivery/html/runtimeContext";

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
    delivery: ContentDeliveryHost,
    field: "notFound" | "forbidden" | "serverError",
    status: number,
    fallbackText: string,
    language?: string,
): Promise<Response> {
    try {
        const settings = await delivery.content.getRenderingSettings();
        const ref = settings.site?.[field] ?? null;
        if (ref) {
            const path = await delivery.content.resolvePageReference(ref);
            const renderable = path ? await delivery.content.getRenderablePage(path) : null;
            if (renderable) {
                const required = pageRequiresCapabilityAnalysis(renderable)
                    ? await delivery.pageCapabilities?.requiredAccess(renderable)
                    : "public";
                const actor = await delivery.resolveActor(req);
                const permitted =
                    required &&
                    (settings.site.visible || actor.kind !== "anonymous") &&
                    (required === "public" ||
                        (required === "authenticated" && actor.kind !== "anonymous") ||
                        (required === "admin" && actor.kind === "administrator"));
                if (!permitted) {
                    return sendCompressed(req, textFallbackEntry(fallbackText), "no-store", { status });
                }

                const { page } = renderable;
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
                const collectionRevision = (await delivery.content.getContentRevision?.()) ?? 0;
                return await cachedResponseAsync(
                    req,
                    `${CMS_CACHE_KEYS.page(page.path)}:collections:${collectionRevision}`,
                    delivery.cache,
                    () => renderPage(page, makeRuntimeRenderContext(delivery)),
                    actor.kind === "anonymous"
                        ? delivery.content.getContentRevision
                            ? "public, no-cache"
                            : "no-store"
                        : "private, no-store",
                    { status, skipCspHeader: true },
                );
            }
        }
    } catch (error) {
        delivery.logger.error("delivery.page.fallback.failed", { field }, error);
    }
    return sendCompressed(req, textFallbackEntry(fallbackText), status === 410 ? "no-store" : undefined, { status });
}
