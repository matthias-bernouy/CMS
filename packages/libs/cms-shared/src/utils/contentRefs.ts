/**
 * Walk HTML content and collect every custom-element reference. Reserved
 * system prefixes (`p9r-*`, `w13c-*`, `be5-*`, `cms-*`) are skipped —
 * they ship with the runtime, not the bloc registry.
 * `<w13c-snippet identifier="X">` is the
 * one exception: we record the identifier as a snippet ref.
 *
 * Pure utility — no I/O. Used by the CLI's pre-push check and the server's
 * write-time gate so both end up rejecting the same set of references.
 */

/**
 * Custom-element prefixes reserved by the system — never valid bloc tags. Single
 * source of truth shared by `extractRefs` (render-time ref extraction),
 * `validateBlocTag` (push-time validation) and the CLI help, so the three can't
 * drift (a tag accepted by validation but dropped by extraction renders nothing).
 */
export const RESERVED_PREFIXES = ["p9r-", "w13c-", "be5-", "cms-"] as const;
const SNIPPET_TAG            = "w13c-snippet";

const TAG_RE = /<([a-z][a-z0-9]*-[a-z0-9-]+)\b([^>]*)/gi;
const ID_RE  = /\bidentifier\s*=\s*["']([^"']+)["']/i;

export function extractRefs(html: string): { blocs: Set<string>; snippets: Set<string> } {
    const blocs    = new Set<string>();
    const snippets = new Set<string>();
    for (const m of html.matchAll(TAG_RE)) {
        const tag = (m[1] ?? "").toLowerCase();
        if (tag === SNIPPET_TAG) {
            const idMatch = ID_RE.exec(m[2] ?? "");
            if (idMatch?.[1]) snippets.add(idMatch[1]);
            continue;
        }
        if (RESERVED_PREFIXES.some(p => tag.startsWith(p))) continue;
        blocs.add(tag);
    }
    return { blocs, snippets };
}
