/**
 * @bernouy/cms-kernel — the CMS HTTP application.
 *
 * `KernelCms` mounts public and Admin pages, assets, authentication and
 * capability calls under an injected runner. It receives the complete
 * repository and runtime adapters from the composition root.
 *
 * Pure on-demand rendering — no Playwright, no build-time pre-rendering.
 */

export { default as KernelCms } from "cms-kernel/KernelCms";
export type { KernelCmsConfig } from "cms-kernel/interfaces/KernelCmsConfig";
export type { HeadInjector, HeadInjectorContext } from "cms-kernel/interfaces/HeadInjector";
export type { ResolvedPageMetadata } from "cms-kernel/core/seo/pageMetadata";
export {
    DEFAULT_SITEMAP_REFRESH_INTERVAL_MS,
    DEFAULT_SITEMAP_RETRY_INTERVAL_MS,
    startSitemapSnapshotRefresh,
    type SitemapRefreshRunner,
} from "cms-kernel/core/seo/sitemap/refresh";
export {
    CanonicalSiteHostNotConfiguredError,
    materializeSitemapSnapshot,
    type SitemapMaterializationResult,
} from "cms-kernel/core/seo/sitemap/materialize";
export type {
    PublicPageProvider,
    PublicPageRequestContext,
    PublicPageResolution,
} from "cms-kernel/interfaces/PublicPageProvider";
