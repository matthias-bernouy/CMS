import type { PageIndexingLocation } from "cms-delivery/core/seo/discoverPageIndexingLocations";
import { sitemapChunkPath, type SitemapSnapshotDescriptor } from "./manifest";

export const MAX_SITEMAP_URLS_PER_CHUNK = 50_000;
export const MAX_SITEMAP_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

export const URLSET_HEADER = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
].join("\n");
export const URLSET_FOOTER = "</urlset>\n";

const XML_ESCAPE: Record<string, string> = {
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
};

export function sitemapUrlXml(publicBaseUrl: string, entry: PageIndexingLocation): string {
    const loc = `<loc>${escapeXml(publicBaseUrl + entry.location)}</loc>`;
    const lastModified = entry.lastModified ? `<lastmod>${escapeXml(entry.lastModified)}</lastmod>` : "";
    return `  <url>${loc}${lastModified}</url>`;
}

export function sitemapIndexXml(snapshot: SitemapSnapshotDescriptor): string {
    const entries = snapshot.chunks.map(({ index }) => {
        const path = sitemapChunkPath(snapshot.id, index);
        const loc = `<loc>${escapeXml(snapshot.publicBaseUrl + path)}</loc>`;
        return `  <sitemap>${loc}<lastmod>${escapeXml(snapshot.generatedAt)}</lastmod></sitemap>`;
    });
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...entries,
        "</sitemapindex>",
        "",
    ].join("\n");
}

export function staticSitemapXml(publicBaseUrl: string, entries: readonly PageIndexingLocation[]): string {
    return [URLSET_HEADER, ...entries.map((entry) => sitemapUrlXml(publicBaseUrl, entry)), URLSET_FOOTER].join("\n");
}

function escapeXml(value: string): string {
    return value.replace(/[<>&'"]/g, (character) => XML_ESCAPE[character]!);
}
