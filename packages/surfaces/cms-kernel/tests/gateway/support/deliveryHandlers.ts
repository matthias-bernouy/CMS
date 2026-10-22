import type { BlobStore } from "@bernouy/blob-store";
import type { ContentReader } from "@bernouy/cms-content/rendering";
import { createRobotsHandler, createSitemapChunkHandler, createSitemapHandler } from "@bernouy/cms-content/seo/http";
import { NOOP_LOGGER } from "@bernouy/logging";

export function deliveryHandlers(
    content: ContentReader,
    options: {
        readonly basePath?: string;
        readonly sitemapStore?: BlobStore;
        readonly capabilityCallsEnabled?: boolean;
    } = {},
) {
    const basePath = options.basePath ?? "";
    const cmsPathPrefix = `${basePath}/.cms`;
    return {
        robotsHandler: createRobotsHandler({
            content,
            basePath,
            cmsPathPrefix,
            collectionAssetsPath: `${cmsPathPrefix}/collections`,
            publicRuntimePaths: [
                `${cmsPathPrefix}/style`,
                `${cmsPathPrefix}/blocstyles`,
                `${cmsPathPrefix}/blocset`,
                `${cmsPathPrefix}/assets/bloc-runtime.js`,
                `${cmsPathPrefix}/assets/cms-binding-core.js`,
            ],
            capabilityCallsEnabled: options.capabilityCallsEnabled ?? false,
            logger: NOOP_LOGGER,
        }),
        sitemapHandler: createSitemapHandler({
            content,
            store: options.sitemapStore,
            isReservedPath: (path) =>
                path === `${basePath}/robots.txt` ||
                path === `${basePath}/sitemap.xml` ||
                path === `${basePath}/favicon.ico` ||
                path === cmsPathPrefix ||
                path.startsWith(`${cmsPathPrefix}/`),
            logger: NOOP_LOGGER,
        }),
        sitemapChunkHandler: createSitemapChunkHandler({
            store: options.sitemapStore,
            basePath,
            logger: NOOP_LOGGER,
        }),
    };
}
