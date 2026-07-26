import type { TPage } from "@bernouy/cms-content";

/** A synthetic CMS page resolved by an adapter injected into Delivery. */
export type PublicPageResolution = Readonly<{
    page: TPage;
    /**
     * Stable identity for the rendered page contents. When omitted, Delivery
     * bypasses its render cache and sends `Cache-Control: no-store`.
     *
     * Providers must change this value whenever anything affecting the page
     * output changes. Query parameters are deliberately unavailable to the
     * provider, so one pathname always has one cache identity.
     */
    cacheIdentity?: string;
}>;

/**
 * Adapter-light seam for public pages backed by data outside ContentReader.
 * Providers run in registration order and receive only the URL pathname.
 */
export type PublicPageProvider = Readonly<{
    resolvePage(pathname: string): Promise<PublicPageResolution | null>;
    /** Canonical absolute paths contributed to the public sitemap. */
    listSitemapPaths?(): Promise<readonly string[]>;
}>;
