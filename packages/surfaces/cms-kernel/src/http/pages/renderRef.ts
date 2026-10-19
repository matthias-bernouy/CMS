import type KernelCms from "cms-kernel/KernelCms";
import { cachedResponseAsync, compress, sendCompressed } from "@bernouy/http-runner";
import { CMS_CACHE_KEYS } from "@bernouy/cms-content/rendering";
import { renderPage } from "cms-kernel/html/renderPage";
import { makeRuntimeRenderContext } from "cms-kernel/html/runtimeContext";

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
    kernel: KernelCms,
    field: "notFound" | "forbidden" | "serverError",
    status: number,
    fallbackText: string,
    language?: string,
): Promise<Response> {
    try {
        const settings = await kernel.content.getRenderingSettings();
        const ref = settings.site?.[field] ?? null;
        if (ref) {
            const path = await kernel.content.resolvePageReference(ref);
            const renderable = path ? await kernel.content.getRenderablePage(path) : null;
            if (renderable) {
                const { page } = renderable;
                if (status === 410) {
                    return sendCompressed(
                        req,
                        await renderPage(page, makeRuntimeRenderContext(kernel), {
                            canonical: null,
                            indexable: false,
                            ...(language ? { language } : {}),
                        }),
                        "no-store",
                        { status, skipCspHeader: true },
                    );
                }
                const collectionRevision = (await kernel.content.getContentRevision?.()) ?? 0;
                return await cachedResponseAsync(
                    req,
                    `${CMS_CACHE_KEYS.page(page.path)}:collections:${collectionRevision}`,
                    kernel.cache,
                    () => renderPage(page, makeRuntimeRenderContext(kernel)),
                    kernel.content.getContentRevision ? "public, no-cache" : undefined,
                    { status, skipCspHeader: true },
                );
            }
        }
    } catch (error) {
        kernel.logger.error("kernel.page.fallback.failed", { field }, error);
    }
    return sendCompressed(req, textFallbackEntry(fallbackText), status === 410 ? "no-store" : undefined, { status });
}
