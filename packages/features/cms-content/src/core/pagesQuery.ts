import type { PageMeta, PagesQuery } from "cms-content/interfaces/CmsRepository";

/**
 * Apply a `PagesQuery` (filter + sort) to page metadata in memory. Shared by
 * the implementations whose backing store can't filter natively — the in-memory
 * repository and the dev filesystem repository. The Mongo provider does the
 * equivalent in its query instead.
 */
export function filterAndSortPages(pages: PageMeta[], opts: PagesQuery = {}): PageMeta[] {
    let rows = pages;

    const search = opts.search?.trim().toLowerCase();
    if (search) {
        rows = rows.filter(p =>
            p.title.toLowerCase().includes(search) || p.path.toLowerCase().includes(search));
    }
    if (opts.tag)                     rows = rows.filter(p => p.tags.includes(opts.tag!));
    if (opts.visible === "published") rows = rows.filter(p => p.visible === true);
    else if (opts.visible === "draft") rows = rows.filter(p => p.visible !== true);

    const sortBy = opts.sortBy ?? "title";
    const dir    = opts.sortOrder === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => compareBy(a, b, sortBy) * dir);
}

function compareBy(a: PageMeta, b: PageMeta, key: "title" | "path" | "visible"): number {
    if (key === "visible") return (a.visible === true ? 1 : 0) - (b.visible === true ? 1 : 0);
    return a[key].localeCompare(b[key], undefined, { sensitivity: "base" });
}
