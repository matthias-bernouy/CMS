import type KernelCms from "cms-kernel/KernelCms";
import { resolveRuntimeAssets } from "cms-kernel/site/assets/resolveAssets";
import { FAVICON_ROUTE } from "cms-kernel/site/assets/defaultFavicon";
import type { RenderContext } from "cms-kernel/site/rendering/RenderContext";
import { resolveCollectionAssetExpressions } from "cms-kernel/site/assets/collectionAssets";
import { resolvePageLinks } from "cms-kernel/site/pages/pageLinks";

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
        enforceCsp: kernel.enforcePageCsp,
    };
}
