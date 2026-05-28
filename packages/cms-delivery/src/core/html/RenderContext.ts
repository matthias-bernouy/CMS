import type { DeliveryRepository } from "src/delivery/interfaces/DeliveryRepository";
import type { HeadInjector } from "src/delivery/interfaces/HeadInjector";
import type { AssetsManifest } from "src/delivery/core/assets/resolveAssets";

/**
 * Everything `renderPage` needs that isn't the page itself. Decoupled from
 * `DeliveryCms` so the same renderer drives both the runtime serving path
 * (assets resolved via the local cache, URLs under `<basePath>/.cms/*`) and
 * the build pipeline (assets pre-uploaded to a CDN, URLs are CDN
 * `absoluteURL`s).
 *
 * `resolveAssets` is the strategy seam — it receives the bloc tags actually
 * used in the page after snippet expansion, and returns hashed URLs ready
 * to inject into `<head>`.
 */
export type RenderContext = {
    repository: DeliveryRepository;
    resolveAssets: (usedTags: string[]) => Promise<AssetsManifest>;
    /** URL emitted as `<link rel="icon">` when `site.favicon` is empty.
     *  Runtime: `<cmsPathPrefix>/assets/favicon`. Build: CDN URL of the
     *  uploaded default SVG. */
    defaultFaviconUrl: string;
    headInjectors: readonly HeadInjector[];
};
