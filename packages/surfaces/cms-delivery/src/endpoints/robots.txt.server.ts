import type DeliveryCms from "cms-delivery/DeliveryCms";
import { canonicalSiteBaseUrl } from "@bernouy/cms-content";
import { CMS_FILES_ROUTE, CMS_IMAGE_VARIANT_ROUTE } from "@bernouy/cms-files";
import { CMS_SOURCES_ROUTE, isPublicSourceImageEndpoint, parseUrn } from "@bernouy/cms-sources";
import { compress, sendCompressed } from "@bernouy/http-runner";

export default async function RobotsServer(req: Request, delivery: DeliveryCms) {
    const [publicBaseUrl, sourceImagePaths] = await Promise.all([
        canonicalSeoBaseUrl(delivery),
        publicSourceImagePaths(delivery),
    ]);

    const body = [
        "User-agent: *",
        "Allow: /",
        `Allow: ${delivery.basePath}${CMS_FILES_ROUTE}/`,
        `Allow: ${delivery.basePath}${CMS_IMAGE_VARIANT_ROUTE}/`,
        ...sourceImagePaths.flatMap((path) => [`Allow: ${path}$`, `Allow: ${path}?`]),
        `Disallow: ${delivery.cmsPathPrefix}/`,
        ...(publicBaseUrl ? [`Sitemap: ${publicBaseUrl}/sitemap.xml`] : []),
        "",
    ].join("\n");

    return sendCompressed(req, compress(body, "text/plain; charset=utf-8"));
}

async function canonicalSeoBaseUrl(delivery: DeliveryCms): Promise<string | null> {
    try {
        return canonicalSiteBaseUrl((await delivery.repository.getSystem()).site.host);
    } catch (error) {
        console.error("Delivery robots canonical host lookup failure", {
            errorType: error instanceof Error ? error.name : "UnknownError",
        });
        return null;
    }
}

async function publicSourceImagePaths(delivery: DeliveryCms): Promise<string[]> {
    if (!delivery.sources) {
        return [];
    }
    try {
        const sources = await delivery.sources.getAllSources();
        const paths = sources.flatMap((source) =>
            source.endpoints.flatMap((endpoint) => {
                const parsed = isPublicSourceImageEndpoint(endpoint) ? parseUrn(endpoint.urn) : null;
                if (!parsed?.endpoint) {
                    return [];
                }
                return [
                    `${delivery.basePath}${CMS_SOURCES_ROUTE}/${encodeURIComponent(parsed.source)}/${encodeURIComponent(parsed.endpoint)}`,
                ];
            }),
        );
        return [...new Set(paths)].sort();
    } catch (error) {
        console.error("Delivery robots source discovery failure", {
            errorType: error instanceof Error ? error.name : "UnknownError",
        });
        return [];
    }
}
