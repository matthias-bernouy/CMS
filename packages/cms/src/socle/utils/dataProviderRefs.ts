import type { TPage, TSnippet, TTemplate } from "src/socle/interfaces/models";
import type { DataProviderConsumers } from "src/socle/interfaces/Data/data";

/**
 * Build a regex that matches any reference to the given provider id in
 * `cms:schema:<id>:...` URN form. The negative lookahead prevents
 * partial-id collisions (`hub` would otherwise match `hub-api`).
 *
 * Source-of-truth for the URN scheme used by the data picker (`v2`
 * format from the brainstorm: `cms:schema:<provider>:<METHOD>:<path>`).
 */
export function dataProviderRefRegex(providerId: string): RegExp {
    const escaped = providerId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`cms:schema:${escaped}(?![a-z0-9-])`);
}

/**
 * Filter every collection content for references to `providerId`. Used
 * by the in-memory + filesystem repository implementations; mongo runs
 * the same regex server-side via `$regex`.
 */
export function findConsumersInCollections(
    providerId: string,
    pages:     TPage[],
    templates: TTemplate[],
    snippets:  TSnippet[],
): DataProviderConsumers {
    const re = dataProviderRefRegex(providerId);
    return {
        pages:     pages.filter    (p => re.test(p.content ?? "")).map(p => ({ path: p.path, title: p.title })),
        templates: templates.filter(t => re.test(t.content ?? "")).map(t => ({ identifier: t.identifier, name: t.name })),
        snippets:  snippets.filter (s => re.test(s.content ?? "")).map(s => ({ identifier: s.identifier, name: s.name })),
    };
}
