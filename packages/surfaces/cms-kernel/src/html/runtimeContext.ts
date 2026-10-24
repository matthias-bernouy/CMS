import type KernelCms from "cms-kernel/KernelCms";
import { resolvePageAssets } from "@bernouy/cms-content/rendering";
import { FAVICON_ROUTE } from "cms-kernel/http/assets/favicon";
import type { RenderContext } from "cms-kernel/html/RenderContext";
import { resolveInstalledCollectionAssets } from "@bernouy/cms-repository/collections/assets";
import { resolvePageLinks } from "cms-kernel/http/pages/pageLinks";
import { resolveSvgSources } from "cms-kernel/html/resolveSvgSources";
import type { RenderingSettings } from "@bernouy/cms-content/rendering";

export type RuntimeRenderSnapshot = {
    readonly renderingSettings?: RenderingSettings;
    readonly contentRevision?: number | string;
};

/**
 * Build a `RenderContext` for the live serving path. Assets are resolved
 * through `kernel.cache` (warmed lazily on first hit) and URLs land
 * under `<cmsPathPrefix>/`. The default favicon falls back to the
 * tenant-scoped stable favicon endpoint.
 */
export function makeRuntimeRenderContext(kernel: KernelCms, snapshot: RuntimeRenderSnapshot = {}): RenderContext {
    return {
        content: kernel.content,
        ...snapshot,
        resolveContributedAssets: (input) =>
            resolveInstalledCollectionAssets(input, kernel.collectionAssets, kernel.basePath),
        resolveSvgSources: (sources) => resolveSvgSources(kernel, sources),
        prepareBody: (body) => resolvePageLinks(body, kernel),
        resolveAssets: (usedTags, renderableBlocs, blocViews) =>
            resolvePageAssets(
                {
                    content: kernel.content,
                    cache: kernel.cache,
                    cmsPathPrefix: kernel.cmsPathPrefix,
                    ...snapshot,
                    blocViews,
                    resolveContributedAssets: (input) =>
                        resolveInstalledCollectionAssets(input, kernel.collectionAssets, kernel.basePath),
                },
                usedTags,
                renderableBlocs,
            ),
        faviconUrl: `${kernel.basePath}${FAVICON_ROUTE}`,
        enforceCsp: kernel.enforcePageCsp,
    };
}
