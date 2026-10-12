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
export { startSitemapSnapshotRefresh } from "cms-kernel/seo/sitemap";
export type {
    PublicPageProvider,
    PublicPageRequestContext,
    PublicPageResolution,
} from "cms-kernel/interfaces/PublicPageProvider";
