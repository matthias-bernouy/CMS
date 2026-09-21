import { publicPagePath, type TPage, type TSystem } from "@bernouy/cms-content";
import type { PageIndexingLocation } from "cms-delivery/core/seo/discoverPageIndexingLocations";

type SitemapPathInfo = {
    language: string;
    alternates: readonly { language: string; location: string }[];
};

type SitemapAlternates = ReadonlyMap<string, SitemapPathInfo>;

/** Expand one stored page into the public paths of its active languages. */
export function localizedSitemapPages(pages: readonly TPage[], system: TSystem): TPage[] {
    const active = new Set([system.site.language, ...(system.site.activeLanguages ?? [])]);
    return pages.flatMap((page) => {
        if (!page.paths) {
            return [page];
        }
        return Object.entries(page.paths)
            .filter(([language]) => active.has(language))
            .map(([language, localPath]) => ({
                ...page,
                path: publicPagePath(language, localPath, system.site.language),
            }));
    });
}

/** Keep the same reciprocal alternate set for each indexable language variant. */
export function localizedSitemapAlternates(pages: readonly TPage[], system: TSystem): SitemapAlternates {
    const active = new Set([system.site.language, ...(system.site.activeLanguages ?? [])]);
    const byPath = new Map<string, SitemapPathInfo>();
    for (const page of pages) {
        if (!page.paths || page.indexing?.enabled === false) {
            continue;
        }
        const variants = Object.entries(page.paths)
            .filter(([language]) => active.has(language))
            .map(([language, local]) => ({
                language,
                location: publicPagePath(language, local, system.site.language),
            }));
        const fallback = variants.find(({ language }) => language === system.site.language);
        const alternates =
            variants.length < 2
                ? []
                : fallback
                  ? [...variants, { language: "x-default", location: fallback.location }]
                  : variants;
        for (const variant of variants) {
            byPath.set(variant.location, { language: variant.language, alternates });
        }
    }
    return byPath;
}

export function withSitemapAlternates(entry: PageIndexingLocation, byPath: SitemapAlternates): PageIndexingLocation {
    const queryStart = entry.location.indexOf("?");
    const pathname = queryStart < 0 ? entry.location : entry.location.slice(0, queryStart);
    const info = byPath.get(pathname);
    if (!info) {
        return entry;
    }
    const search = queryStart < 0 ? "" : entry.location.slice(queryStart);
    return {
        ...entry,
        language: info.language,
        ...(info.alternates.length > 0
            ? {
                  alternates: info.alternates.map(({ language, location }) => ({
                      language,
                      location: `${location}${search}`,
                  })),
              }
            : {}),
    };
}
