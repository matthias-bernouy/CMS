import type { PublicFileMetadataLookup, BlobReader, VariantStore } from "@bernouy/cms-content/files/serving";
import type { ContentReader } from "@bernouy/cms-content";
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
    resolveAssets: (usedTags: string[]) => Promise<AssetsManifest>;
    /** Public stable URL emitted as `<link rel="icon">`. */
    faviconUrl: string;
    headInjectors: readonly HeadInjector[];
    /** Files metadata, used to resolve each `by-id` media URL's `contentHash`
     *  for the cache-busting `?v=` token. Optional — absent when no files
     *  backend is wired, in which case media URLs render unversioned. */
    filesMetadata?: PublicFileMetadataLookup;
    /** Shared variant store — read for manifests to build responsive `srcset`s.
     *  Absent → images render as the (versioned) original. */
    variantStore?: VariantStore;
    /** Enqueue background optimization for a page's not-yet-optimized images.
     *  Absent → no optimization (originals only). */
    optimizePage?: (path: string, imageIds: string[]) => void;
};
