import { canonicalSiteBaseUrl, type TPage, type TSystem } from "@bernouy/cms-content";

export type PageMetaTagOverrides = {
    title?: string;
    description?: string;
    canonicalUrl?: string | null;
    robots?: string;
};

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
    faviconUrl: string,
    overrides: PageMetaTagOverrides = {},
): void {
    const title = document.createElement("title");
    title.textContent = overrides.title ?? page.title;
    head.appendChild(title);

    const metaDescription = document.createElement("meta");
    metaDescription.setAttribute("name", "description");
    metaDescription.setAttribute("content", overrides.description ?? page.description);
    head.appendChild(metaDescription);

    const favicon = document.createElement("link");
    favicon.setAttribute("rel", "icon");
    favicon.setAttribute("href", faviconUrl);
    head.appendChild(favicon);

    const host = canonicalSiteBaseUrl(settings.site?.host);
    const canonicalUrl =
        overrides.canonicalUrl === undefined ? (host ? `${host}${page.path}` : "") : overrides.canonicalUrl;
    if (canonicalUrl) {
        const canonical = document.createElement("link");
        canonical.setAttribute("rel", "canonical");
        canonical.setAttribute("href", canonicalUrl);
        head.appendChild(canonical);
    }

    if (overrides.robots) {
        const robots = document.createElement("meta");
        robots.setAttribute("name", "robots");
        robots.setAttribute("content", overrides.robots);
        head.appendChild(robots);
    }
}
