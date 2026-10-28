import type ContentDeliveryHost from "cms-content/pages/delivery/interfaces";
import { resolvePageAssets } from "@bernouy/cms-content/rendering";
import { FAVICON_ROUTE } from "cms-content/pages/delivery/http/assets/favicon";
import type { RenderContext } from "cms-content/pages/delivery/html/RenderContext";

import { resolvePageLinks } from "cms-content/pages/delivery/http/pages/pageLinks";

import type { ContentReader, PageRenderInputs, RenderingSettings } from "@bernouy/cms-content/rendering";
import { measureCurrentRequestTiming } from "@bernouy/http-runner/observability";

export type RuntimeRenderSnapshot = {
    readonly renderingSettings?: RenderingSettings;
    readonly contentRevision?: number | string;
    readonly pageRenderInputs?: PageRenderInputs;
};

/**
 * Build a `RenderContext` for the live serving path. Assets are resolved
 * through `delivery.cache` (warmed lazily on first hit) and URLs land
 * under `<cmsPathPrefix>/`. The default favicon falls back to the
 * tenant-scoped stable favicon endpoint.
 */
export function makeRuntimeRenderContext(
    delivery: ContentDeliveryHost,
    snapshot: RuntimeRenderSnapshot = {},
): RenderContext {
    const content = contentForRender(delivery.content, snapshot);
    return {
        content,
        ...snapshot,
        resolveContributedAssets: (input) => delivery.resolveContributedAssets(input),
        resolveSvgSources: (sources) =>
            measureCurrentRequestTiming("page_svg_sources", async () =>
                delivery.resolveSvgSources
                    ? await delivery.resolveSvgSources(sources)
                    : new Map<string, string | Uint8Array>(),
            ),
        prepareBody: (body) => measureCurrentRequestTiming("page_links", () => resolvePageLinks(body, delivery)),
        resolveAssets: (usedTags, renderableBlocs, blocViews) =>
            resolvePageAssets(
                {
                    content,
                    cache: delivery.cache,
                    cmsPathPrefix: delivery.cmsPathPrefix,
                    ...snapshot,
                    blocViews,
                    resolveContributedAssets: (input) => delivery.resolveContributedAssets(input),
                },
                usedTags,
                renderableBlocs,
            ),
        faviconUrl: `${delivery.basePath}${FAVICON_ROUTE}`,
    };
}

function contentForRender(content: ContentReader, snapshot: RuntimeRenderSnapshot): ContentReader {
    const inputs = snapshot.pageRenderInputs;
    const renderingRevision = inputs?.renderingRevision ?? snapshot.contentRevision;
    if (!inputs && renderingRevision === undefined) {
        return content;
    }
    return Object.assign(Object.create(content) as ContentReader, {
        ...(renderingRevision === undefined
            ? {}
            : {
                  getContentRevision: async () => renderingRevision,
                  getRenderingRevision: async () => renderingRevision,
              }),
        ...(inputs
            ? {
                  getContentTexts: async () => [...inputs.contentTexts],
                  getRenderableBlocs: async () => [...inputs.renderableBlocs],
                  getRenderingSettings: async () => inputs.settings,
              }
            : {}),
    });
}
