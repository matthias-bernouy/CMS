import type { TPage, TSystem } from "src/socle/interfaces/models";

/**
 * Force any favicon URL that targets the media endpoint to request the 64px
 * icon-tier variant — otherwise a 2000×2000 source would ship multi-MB bytes
 * for a tab icon. SVG media keep their resolution (the media endpoint skips
 * resize for SVG). Non-media URLs pass through untouched.
 *
 * Matches any URL ending with `/media` before the query string so both the
 * new prefixed path (`/.cms/media`) and any legacy `/media` reference
 * resolve the same way.
 */
function normalizeFaviconHref(href: string): string {
    const qIdx = href.indexOf("?");
    if (qIdx < 0) return href;
    const base = href.slice(0, qIdx);
    if (!base.endsWith("/media")) return href;
    const params = new URLSearchParams(href.slice(qIdx + 1));
    params.set("w", "64");
    return `${base}?${params.toString()}`;
}

/**
 * Emit the head tags carrying SEO / browser-metadata weight: title,
 * description, favicon, canonical. Charset / viewport / language are HTML
 * basics and live in `buildHtmlBasics`.
 */
export function defineMetaTags(
    document: Document,
    head: HTMLElement,
    page: TPage,
    settings: TSystem,
    defaultFaviconUrl: string,
): void {
    const title = document.createElement("title");
    title.textContent = page.title;
    head.appendChild(title);

    const metaDescription = document.createElement("meta");
    metaDescription.setAttribute("name",    "description");
    metaDescription.setAttribute("content", page.description);
    head.appendChild(metaDescription);

    const favicon = document.createElement("link");
    favicon.setAttribute("rel", "icon");
    const rawFavicon = settings.site?.favicon?.trim() || defaultFaviconUrl;
    favicon.setAttribute("href", normalizeFaviconHref(rawFavicon));
    head.appendChild(favicon);

    // Canonical link when a host is configured. Trailing slash of the host
    // is stripped so we don't emit `https://site.com//about`.
    const host = settings.site?.host?.trim().replace(/\/+$/, "") ?? "";
    if (host) {
        const canonical = document.createElement("link");
        canonical.setAttribute("rel",  "canonical");
        canonical.setAttribute("href", `${host}${page.path}`);
        head.appendChild(canonical);
    }
}
