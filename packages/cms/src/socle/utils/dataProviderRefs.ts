import type { TPage, TSnippet, TTemplate } from "src/socle/interfaces/models";
import type { DataProviderConsumers } from "src/socle/interfaces/Data/data";

/**
 * Build a regex that matches any reference to the given provider's
 * `server` URL inside HTML content. The negative lookahead prevents
 * partial-segment collisions (`https://api.x.com/v1` shouldn't match
 * `https://api.x.com/v10`).
 *
 * Returns `null` for empty/whitespace input — providers with no server
 * URL can't be detected this way and are treated as consumer-free.
 *
 * Trailing slashes on the input are normalised away so a server stored
 * as `https://api.x.com/` still matches references written as
 * `https://api.x.com/users`.
 */
export function dataProviderRefRegex(serverUrl: string): RegExp | null {
    const trimmed = serverUrl.trim().replace(/\/+$/, "");
    if (!trimmed) return null;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`${escaped}(?![A-Za-z0-9._~%-])`);
}

/**
 * Filter every collection content for references to `serverUrl`. Used
 * by the in-memory + filesystem repository implementations; mongo runs
 * the same regex server-side via `$regex`.
 */
export function findConsumersInCollections(
    serverUrl: string,
    pages:     TPage[],
    templates: TTemplate[],
    snippets:  TSnippet[],
): DataProviderConsumers {
    const re = dataProviderRefRegex(serverUrl);
    if (!re) return { pages: [], templates: [], snippets: [] };
    return {
        pages:     pages.filter    (p => re.test(p.content ?? "")).map(p => ({ path: p.path, title: p.title })),
        templates: templates.filter(t => re.test(t.content ?? "")).map(t => ({ identifier: t.identifier, name: t.name })),
        snippets:  snippets.filter (s => re.test(s.content ?? "")).map(s => ({ identifier: s.identifier, name: s.name })),
    };
}
