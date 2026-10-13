import { canonicalSiteBaseUrl, type ContentReader } from "@bernouy/cms-content/rendering";
import { compress, sendCompressed } from "@bernouy/http-runner";

export type RobotsHandlerConfig = {
    content: Pick<ContentReader, "getRenderingSettings">;
    basePath: string;
    cmsPathPrefix: string;
    collectionAssetsPath: string;
    publicRuntimePaths: readonly string[];
    capabilityCallsEnabled: boolean;
};

export function createRobotsHandler(config: RobotsHandlerConfig) {
    return async (request: Request): Promise<Response> => {
        const settings = await renderingSettings(config.content);
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

async function renderingSettings(content: Pick<ContentReader, "getRenderingSettings">) {
    try {
        return await content.getRenderingSettings();
    } catch (error) {
        console.error("Robots canonical host lookup failure", {
            errorType: error instanceof Error ? error.name : "UnknownError",
        });
        return null;
    }
}
