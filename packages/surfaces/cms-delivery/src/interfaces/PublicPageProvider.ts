import type { TPage } from "@bernouy/cms-content";

/** A synthetic CMS page resolved by an adapter injected into Delivery. */
export type PublicPageResolution = Readonly<{
    page: TPage;
    /** HTTP status for an explicitly rendered error page. Defaults to 200. */
    status?: number;
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

export type PublicPageRequestContext = Readonly<{
    /** Decoded, duplicate-preserving and resource-bounded query values. */
    searchParams: Readonly<Record<string, readonly string[]>>;
    hasSearchParams: boolean;
}>;

/**
 * Adapter-light fallback for public pages backed by data outside ContentReader.
 * A published CMS page always wins for the same pathname. When ContentReader
 * has no such page, providers run in registration order. Query-bearing provider
 * pages are always rendered with `no-store`, regardless of their cache identity.
 */
export type PublicPageProvider = Readonly<{
    resolvePage(pathname: string, context: PublicPageRequestContext): Promise<PublicPageResolution | null>;
    /** Canonical absolute paths contributed to the public sitemap. */
    listSitemapPaths?(): Promise<readonly string[]>;
}>;
