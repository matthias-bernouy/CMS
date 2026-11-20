import { CaptureError } from "@bernouy/browser-capture";
import type { ContentDelivery, ContentDeliveryOptions } from "content/pages/delivery/ContentDelivery";
import type { TPage } from "content/pages/interfaces/pages";
import { PUBLISHED_PAGE_SNAPSHOT_ROUTE } from "content/pages/http/publishedPageSnapshot";
import { renderPageCapture } from "./renderPage";

export async function captureDeliveryDocument(
    options: ContentDeliveryOptions,
    resolve: ContentDelivery["resolvePath"],
    page: TPage,
    locale: string,
    themeMode: "light" | "dark",
    signal?: AbortSignal,
) {
    const refusal = await options.guard?.(new Request(new URL(page.path, options.publicUrl), { signal }));
    if (refusal) {
        await refusal.body?.cancel();
        throw new CaptureError("UNAVAILABLE");
    }
    return renderPageCapture(
        page,
        { ...options, basePath: "", cmsPathPrefix: "/_content", resolveActor: async () => ({ kind: "anonymous" }) },
        {
            locale,
            themeMode,
            publicUrl: options.publicUrl,
            signal,
            readResource: (path) =>
                path.startsWith("/_content/") && !path.startsWith(PUBLISHED_PAGE_SNAPSHOT_ROUTE)
                    ? resolve(
                          {
                              path: path.split("?")[0],
                              method: "GET",
                              query: Array.from(new URLSearchParams(path.split("?")[1]), ([name, value]) => ({
                                  name,
                                  value,
                              })),
                          },
                          { kind: "anonymous" },
                          undefined,
                          { signal },
                      )
                    : (options.readCaptureResource?.(path, signal) ??
                      Promise.resolve(new Response(null, { status: 404 }))),
        },
    );
}
