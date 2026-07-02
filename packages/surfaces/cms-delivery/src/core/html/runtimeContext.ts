import type DeliveryCms from "cms-delivery/DeliveryCms";
import { resolveRuntimeAssets } from "cms-delivery/core/assets/resolveAssets";
import type { RenderContext } from "cms-delivery/core/html/RenderContext";

/**
 * Build a `RenderContext` for the live serving path. Assets are resolved
 * through `delivery.cache` (warmed lazily on first hit) and URLs land
 * under `<cmsPathPrefix>/`. The default favicon falls back to the
 * tenant-scoped endpoint at `<cmsPathPrefix>/assets/favicon`.
 */
export function makeRuntimeRenderContext(delivery: DeliveryCms): RenderContext {
    return {
        repository: delivery.repository,
        resolveAssets: (usedTags) => resolveRuntimeAssets(delivery, usedTags),
        defaultFaviconUrl: `${delivery.cmsPathPrefix}/assets/favicon`,
        headInjectors: delivery.headInjectors,
        integrationInstances: delivery.integrationInstances,
        filesMetadata: delivery.filesMetadataOrNull ?? undefined,
        variantStore: delivery.variantStoreOrNull ?? undefined,
        optimizePage: (path, imageIds) => delivery.optimizePage(path, imageIds),
    };
}
