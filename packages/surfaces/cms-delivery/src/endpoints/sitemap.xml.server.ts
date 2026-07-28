import type DeliveryCms from "cms-delivery/DeliveryCms";
import { compress, sendCompressed } from "@bernouy/http-runner";
import { collectPublicPageProviderPaths, isDeliveryReservedPath } from "cms-delivery/core/pages/publicPagePaths";

const XML_ESCAPE: Record<string, string> = {
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
};

function escapeXml(s: string): string {
    return s.replace(/[<>&'"]/g, (c) => XML_ESCAPE[c]!);
}

export default async function SitemapServer(req: Request, delivery: DeliveryCms) {
    try {
        return await buildSitemapResponse(req, delivery);
    } catch (err) {
        console.error("Delivery sitemap failure", {
            errorType: err instanceof Error ? err.name : "UnknownError",
        });
        return new Response("Internal Server Error", { status: 500 });
    }
}

async function buildSitemapResponse(req: Request, delivery: DeliveryCms): Promise<Response> {
    const origin = new URL(req.url).origin;
    const prefix = delivery.cmsPathPrefix;
    const [pages, providerPaths] = await Promise.all([
        delivery.repository.getPublishedPages(),
        collectPublicPageProviderPaths(delivery.publicPageProviders, prefix),
    ]);

    const urls: string[] = [];
    const seen = new Set<string>();
    for (const path of [...pages.map((page) => page.path), ...providerPaths]) {
        if (isDeliveryReservedPath(path, prefix)) {
            continue;
        }
        if (seen.has(path)) {
            continue;
        }
        seen.add(path);
        urls.push(`  <url><loc>${escapeXml(origin + path)}</loc></url>`);
    }

    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls,
        "</urlset>",
        "",
    ].join("\n");

    return sendCompressed(req, compress(xml, "application/xml; charset=utf-8"));
}
