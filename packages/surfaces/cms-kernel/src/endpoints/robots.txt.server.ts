import type KernelCms from "cms-kernel/KernelCms";
import { canonicalSiteBaseUrl } from "@bernouy/cms-content/rendering";
import { compress, sendCompressed } from "@bernouy/http-runner";
import { COLLECTION_ASSETS_ROUTE } from "cms-kernel/core/assets/collectionAssets";

export default async function RobotsServer(req: Request, kernel: KernelCms) {
    const publicBaseUrl = await canonicalSeoBaseUrl(kernel);

    const body = [
        "User-agent: *",
        "Allow: /",
        ...publicRuntimePaths(kernel).flatMap((path) => [`Allow: ${path}$`, `Allow: ${path}?`]),
        `Allow: ${kernel.basePath}${COLLECTION_ASSETS_ROUTE}/`,
        ...(kernel.capabilityGateway ? [`Allow: ${kernel.cmsPathPrefix}/call/`] : []),
        `Disallow: ${kernel.cmsPathPrefix}/`,
        ...(publicBaseUrl ? [`Sitemap: ${publicBaseUrl}/sitemap.xml`] : []),
        "",
    ].join("\n");

    return sendCompressed(req, compress(body, "text/plain; charset=utf-8"));
}

function publicRuntimePaths(kernel: KernelCms): string[] {
    return [
        `${kernel.cmsPathPrefix}/style`,
        `${kernel.cmsPathPrefix}/blocset`,
        `${kernel.cmsPathPrefix}/assets/component.js`,
        `${kernel.cmsPathPrefix}/assets/cms-binding-core.js`,
    ];
}

async function canonicalSeoBaseUrl(kernel: KernelCms): Promise<string | null> {
    try {
        return canonicalSiteBaseUrl((await kernel.repository.getRenderingSettings()).site.host);
    } catch (error) {
        console.error("Kernel robots canonical host lookup failure", {
            errorType: error instanceof Error ? error.name : "UnknownError",
        });
        return null;
    }
}
