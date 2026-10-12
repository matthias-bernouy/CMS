import { canonicalSiteBaseUrl, type ContentReader } from "@bernouy/cms-content/rendering";
import { compress, sendCompressed } from "@bernouy/http-runner";

export type RobotsHandlerConfig = {
    content: Pick<ContentReader, "getRenderingSettings">;
    cmsPathPrefix: string;
    collectionAssetsPath: string;
    publicRuntimePaths: readonly string[];
    capabilityCallsEnabled: boolean;
};

export function createRobotsHandler(config: RobotsHandlerConfig) {
    return async (request: Request): Promise<Response> => {
        const publicBaseUrl = await canonicalSeoBaseUrl(config.content);
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

async function canonicalSeoBaseUrl(content: Pick<ContentReader, "getRenderingSettings">): Promise<string | null> {
    try {
        return canonicalSiteBaseUrl((await content.getRenderingSettings()).site.host);
    } catch (error) {
        console.error("Robots canonical host lookup failure", {
            errorType: error instanceof Error ? error.name : "UnknownError",
        });
        return null;
    }
}
