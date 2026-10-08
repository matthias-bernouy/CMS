import type DeliveryCms from "cms-delivery/DeliveryCms";
import { canonicalSiteBaseUrl } from "@bernouy/cms-content/rendering";
import { compress, sendCompressed } from "@bernouy/http-runner";
import { COLLECTION_ASSETS_ROUTE } from "cms-delivery/core/assets/collectionAssets";

export default async function RobotsServer(req: Request, delivery: DeliveryCms) {
    const publicBaseUrl = await canonicalSeoBaseUrl(delivery);

    const body = [
        "User-agent: *",
        "Allow: /",
        ...publicRuntimePaths(delivery).flatMap((path) => [`Allow: ${path}$`, `Allow: ${path}?`]),
        `Allow: ${delivery.basePath}${COLLECTION_ASSETS_ROUTE}/`,
        ...(delivery.capabilityGateway ? [`Allow: ${delivery.cmsPathPrefix}/call/`] : []),
        `Disallow: ${delivery.cmsPathPrefix}/`,
        ...(publicBaseUrl ? [`Sitemap: ${publicBaseUrl}/sitemap.xml`] : []),
        "",
    ].join("\n");

    return sendCompressed(req, compress(body, "text/plain; charset=utf-8"));
}

function publicRuntimePaths(delivery: DeliveryCms): string[] {
    return [
        `${delivery.cmsPathPrefix}/style`,
        `${delivery.cmsPathPrefix}/blocset`,
        `${delivery.cmsPathPrefix}/assets/component.js`,
        `${delivery.cmsPathPrefix}/assets/cms-binding-core.js`,
    ];
}

async function canonicalSeoBaseUrl(delivery: DeliveryCms): Promise<string | null> {
    try {
        return canonicalSiteBaseUrl((await delivery.repository.getRenderingSettings()).site.host);
    } catch (error) {
        console.error("Delivery robots canonical host lookup failure", {
            errorType: error instanceof Error ? error.name : "UnknownError",
        });
        return null;
    }
}
