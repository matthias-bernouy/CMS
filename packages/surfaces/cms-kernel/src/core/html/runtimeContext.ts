import type KernelCms from "cms-kernel/KernelCms";
import { resolveRuntimeAssets } from "cms-kernel/core/assets/resolveAssets";
import { FAVICON_ROUTE } from "cms-kernel/core/assets/defaultFavicon";
import type { RenderContext } from "cms-kernel/core/html/RenderContext";
import { resolveCollectionAssetExpressions } from "cms-kernel/core/assets/collectionAssets";
import { resolvePageLinks } from "cms-kernel/core/pages/pageLinks";

/**
 * Build a `RenderContext` for the live serving path. Assets are resolved
 * through `kernel.cache` (warmed lazily on first hit) and URLs land
 * under `<cmsPathPrefix>/`. The default favicon falls back to the
 * tenant-scoped stable favicon endpoint.
 */
export function makeRuntimeRenderContext(kernel: KernelCms): RenderContext {
    return {
        repository: kernel.repository,
        resolveContributedAssets: (input) => resolveCollectionAssetExpressions(input, kernel),
        prepareBody: (body) => resolvePageLinks(body, kernel),
        resolveAssets: (usedTags) => resolveRuntimeAssets(kernel, usedTags),
        faviconUrl: `${kernel.basePath}${FAVICON_ROUTE}`,
    };
}
