import type { CollectionTextSource } from "@bernouy/cms-repository/collections/content";
import type { ContentReader } from "@bernouy/cms-content/rendering";
import type { HeadInjector } from "cms-delivery/interfaces/HeadInjector";
import type { AssetsManifest } from "cms-delivery/core/assets/resolveAssets";

/**
 * Everything `renderPage` needs that isn't the page itself. Decoupled from
 * `DeliveryCms` so the same renderer drives both the runtime serving path
 * (assets resolved via the local cache, URLs under `<basePath>/.cms/*`) and
 * the build pipeline (assets pre-uploaded to a CDN, URLs are CDN
 * `absoluteURL`s).
 *
 * `resolveAssets` is the strategy seam — it receives the bloc tags actually
 * used in the page and returns hashed URLs ready to inject into `<head>`.
 */
export type RenderContext = {
    repository: ContentReader;
    collectionTexts?: readonly CollectionTextSource[];
    resolveContributedAssets?: (input: string) => Promise<string>;
    resolveAssets: (usedTags: string[]) => Promise<AssetsManifest>;
    /** Public stable URL emitted as `<link rel="icon">`. */
    faviconUrl: string;
    headInjectors: readonly HeadInjector[];
};
