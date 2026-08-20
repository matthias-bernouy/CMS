import type DeliveryCms from "cms-delivery/DeliveryCms";
import { resolveRuntimeAssets } from "cms-delivery/core/assets/resolveAssets";
import { FAVICON_ROUTE } from "cms-delivery/core/assets/defaultFavicon";
import type { RenderContext } from "cms-delivery/core/html/RenderContext";

/**
 * Build a `RenderContext` for the live serving path. Assets are resolved
 * through `delivery.cache` (warmed lazily on first hit) and URLs land
 * under `<cmsPathPrefix>/`. The default favicon falls back to the
 * tenant-scoped stable favicon endpoint.
 */
export function makeRuntimeRenderContext(delivery: DeliveryCms): RenderContext {
    return {
        repository: delivery.repository,
        resolveAssets: (usedTags) => resolveRuntimeAssets(delivery, usedTags),
        faviconUrl: `${delivery.basePath}${FAVICON_ROUTE}`,
        headInjectors: delivery.headInjectors,
        integrationInstallations: delivery.integrationInstallations,
        filesMetadata: delivery.filesMetadataOrNull ?? undefined,
        variantStore: delivery.variantStoreOrNull ?? undefined,
        optimizePage: (path, imageIds) => delivery.optimizePage(path, imageIds),
    };
}
