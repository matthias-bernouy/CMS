import type DeliveryCms from "src/delivery/DeliveryCms";
import { compress, sendCompressed } from "src/socle/server/compression";

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

/**
 * Delivery reserves only its own asset prefix (`cmsPathPrefix`) plus the
 * well-known root files (`/robots.txt`, `/sitemap.xml`). Anything else is a
 * legitimate user page and belongs in the sitemap.
 */
function isReservedForDelivery(path: string, prefix: string): boolean {
    if (path === "/robots.txt" || path === "/sitemap.xml") return true;
    if (path === prefix || path.startsWith(prefix + "/")) return true;
    return false;
}

export default async function SitemapServer(req: Request, delivery: DeliveryCms) {
    const origin = new URL(req.url).origin;
    const prefix = delivery.cmsPathPrefix;
    const pages  = await delivery.repository.getAllPages();

    const urls: string[] = [];
    const seen = new Set<string>();
    for (const p of pages) {
        if (!p.visible) continue;
        if (isReservedForDelivery(p.path, prefix)) continue;
        if (seen.has(p.path)) continue;
        seen.add(p.path);
        urls.push(`  <url><loc>${escapeXml(origin + p.path)}</loc></url>`);
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
