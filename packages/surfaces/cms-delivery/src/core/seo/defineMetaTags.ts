import {
    canonicalSiteBaseUrl,
    publicPagePath,
    type RenderingSettings,
    type TPage,
} from "@bernouy/cms-content/rendering";

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
    settings: RenderingSettings,
    faviconUrl: string,
    overrides: PageMetaTagOverrides = {},
    routeLanguages: Pick<RenderingSettings["site"], "language" | "activeLanguages"> = settings.site,
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

    if (canonicalUrl && !overrides.robots?.includes("noindex") && page.paths) {
        const active = new Set([routeLanguages.language, ...(routeLanguages.activeLanguages ?? [])]);
        const variants = Object.entries(page.paths).filter(([language]) => active.has(language));
        if (variants.length > 1) {
            const search = new URL(canonicalUrl).search;
            for (const [language, local] of variants) {
                const alternate = document.createElement("link");
                alternate.setAttribute("rel", "alternate");
                alternate.setAttribute("hreflang", language);
                alternate.setAttribute(
                    "href",
                    `${host}${publicPagePath(language, local, routeLanguages.language)}${search}`,
                );
                head.appendChild(alternate);
            }
            const defaultPath = page.paths[routeLanguages.language];
            if (defaultPath) {
                const fallback = document.createElement("link");
                fallback.setAttribute("rel", "alternate");
                fallback.setAttribute("hreflang", "x-default");
                fallback.setAttribute(
                    "href",
                    `${host}${publicPagePath(routeLanguages.language, defaultPath, routeLanguages.language)}${search}`,
                );
                head.appendChild(fallback);
            }
        }
    }

    if (overrides.robots) {
        const robots = document.createElement("meta");
        robots.setAttribute("name", "robots");
        robots.setAttribute("content", overrides.robots);
        head.appendChild(robots);
    }
}
