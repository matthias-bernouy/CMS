import { canonicalSiteBaseUrl, type ContentReader } from "@bernouy/cms-content/rendering";
import { compress, sendCompressed } from "@bernouy/http-runner";
import type { Logger } from "@bernouy/logging";

export type RobotsHandlerConfig = {
    content: Pick<ContentReader, "getRenderingSettings">;
    basePath: string;
    cmsPathPrefix: string;
    collectionAssetsPath: string;
    publicRuntimePaths: readonly string[];
    capabilityCallsEnabled: boolean;
    logger: Logger;
};

export function createRobotsHandler(config: RobotsHandlerConfig) {
    return async (request: Request): Promise<Response> => {
        const settings = await renderingSettings(config.content, config.logger);
        if (settings?.site.visible === false) {
            const root = config.basePath ? `${config.basePath}/` : "/";
            const body = `User-agent: *\nDisallow: ${root}\n`;
            return sendCompressed(request, compress(body, "text/plain; charset=utf-8"), "no-store");
        }
        const publicBaseUrl = settings ? canonicalSiteBaseUrl(settings.site.host) : null;
        const body = [
            "User-agent: *",
            "Allow: /",
            ...config.publicRuntimePaths.flatMap((path) => [`Allow: ${path}$`, `Allow: ${path}?`]),
            `Allow: ${config.collectionAssetsPath}/`,
            ...(config.capabilityCallsEnabled ? [`Allow: ${config.cmsPathPrefix}/call/`] : []),
            `Disallow: ${config.cmsPathPrefix}/`,
            ...(publicBaseUrl ? [`Sitemap: ${publicBaseUrl}/sitemap.xml`] : []),
            "",
        ].join("\n");
        return sendCompressed(request, compress(body, "text/plain; charset=utf-8"));
    };
}

async function renderingSettings(content: Pick<ContentReader, "getRenderingSettings">, logger: Logger) {
    try {
        return await content.getRenderingSettings();
    } catch (error) {
        logger.error("seo.robots.settings.failed", {}, error);
        return null;
    }
}
