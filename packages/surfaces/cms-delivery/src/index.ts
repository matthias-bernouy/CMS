/**
 * @bernouy/cms-delivery — public rendering layer of the CMS.
 *
 * `DeliveryCms` mounts page resolution, bloc bundles, theme CSS, the
 * component runtime, and the default favicon under whatever runner the
 * consumer provides. Reads from a `ContentReader` (the read-only
 * subset of `CmsRepository`); a `MongoCmsRepository` / `InMemoryCmsRepository`
 * from `@bernouy/cms-content` satisfies it by structural typing.
 *
 * Pure on-demand rendering — no Playwright, no build-time pre-rendering.
 */

export { default as DeliveryCms } from "cms-delivery/DeliveryCms";
export type { DeliveryCmsConfig } from "cms-delivery/interfaces/DeliveryCmsConfig";
export type { ContentReader } from "@bernouy/cms-content";
export type { HeadInjector, HeadInjectorContext } from "cms-delivery/interfaces/HeadInjector";
export type { ResolvedPageMetadata } from "cms-delivery/core/seo/pageMetadata";
export {
    DEFAULT_SITEMAP_REFRESH_INTERVAL_MS,
    DEFAULT_SITEMAP_RETRY_INTERVAL_MS,
    startSitemapSnapshotRefresh,
    type SitemapRefreshRunner,
} from "cms-delivery/core/seo/sitemap/refresh";
export {
    materializeSitemapSnapshot,
    type SitemapMaterializationResult,
} from "cms-delivery/core/seo/sitemap/materialize";
export type {
    PublicPageProvider,
    PublicPageRequestContext,
    PublicPageResolution,
} from "cms-delivery/interfaces/PublicPageProvider";
