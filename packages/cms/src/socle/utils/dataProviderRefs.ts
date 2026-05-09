import type { TPage, TSnippet, TTemplate } from "src/socle/interfaces/models";
import type { DataProviderConsumers } from "src/socle/interfaces/Data/data";
import { DATA_PROXY_PREFIX } from "src/socle/constants/p9r-constants";

/**
 * Build a regex that matches any reference to the given provider's
 * proxy path inside HTML content. The proxy URL shape is
 * `<DATA_PROXY_PREFIX>/<providerId>/...`, so we look for the literal
 * `<prefix>/<id>/` — the trailing `/` is the boundary that prevents
 * partial-id collisions (`id="hub"` shouldn't match `hub-v2`).
 *
 * Returns `null` for empty/whitespace input.
 */
export function dataProviderRefRegex(providerId: string): RegExp | null {
    const trimmed = providerId.trim();
    if (!trimmed) return null;
    const escapedId     = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedPrefix = DATA_PROXY_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`${escapedPrefix}/${escapedId}/`);
}

/**
 * Filter every collection content for references to the provider's
 * proxy path. Used by the in-memory + filesystem repository
 * implementations; mongo runs the same regex server-side via `$regex`.
 */
export function findConsumersInCollections(
    providerId: string,
    pages:      TPage[],
    templates:  TTemplate[],
    snippets:   TSnippet[],
): DataProviderConsumers {
    const re = dataProviderRefRegex(providerId);
    if (!re) return { pages: [], templates: [], snippets: [] };
    return {
        pages:     pages.filter    (p => re.test(p.content ?? "")).map(p => ({ path: p.path, title: p.title })),
        templates: templates.filter(t => re.test(t.content ?? "")).map(t => ({ identifier: t.identifier, name: t.name })),
        snippets:  snippets.filter (s => re.test(s.content ?? "")).map(s => ({ identifier: s.identifier, name: s.name })),
    };
}
