/**
 * Cache key builders. Every `system.cache.{get,set,delete}` call should go
 * through one of these so the prefixes stay consistent and greppable.
 */
export const P9R_CACHE = {
    bloc: (id: string) => `bloc:${id}`,
    BLOCSET_PREFIX: "blocset:",
    /** A signature-grouped bundle = several blocs concatenated. Keyed on the
     *  deduped+sorted tag set so any page using the same set shares the entry. */
    blocset: (tags: string[]) => `blocset:${[...new Set(tags)].sort().join(",")}`,
    page: (path: string) => `page:${path}`,
    css: (url: string) => `css:${url}`,
    js: (url: string) => `js:${url}`,
    html: (url: string) => `html:${url}`,
    font: (url: string) => `font:${url}`,
    /** The single theme CSS served at `/style`. */
    STYLE: "style:main",
    /**
     * Consolidated editor bundle served at `<admin>/admin/editor-script`.
     * Contains the static editor runtime plus every bloc's editorJS and
     * viewJS concatenated — invalidated on any bloc write.
     */
    EDITOR_SCRIPT: "js:editor-script",
    /** Consolidated bloc view bundle used by the editor frame preview. */
    EDITOR_VIEW_SCRIPT: "js:editor-view-script",
} as const;
