import type { TPage, TSystem } from "@bernouy/cms-content";

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
    favicon.setAttribute("href", settings.site?.favicon?.trim() || defaultFaviconUrl);
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
