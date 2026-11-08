/**
 * Walk HTML content and collect every explicit `cms-bloc` reference.
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

const BLOC_RE = /\bcms-bloc\s*=\s*(["'])([a-z][a-z0-9]*-[a-z0-9-]+)\1/giu;

export function extractRefs(html: string): { blocs: Set<string> } {
    const blocs = new Set<string>();
    for (const m of html.matchAll(BLOC_RE)) {
        const tag = (m[2] ?? "").toLowerCase();
        if (RESERVED_PREFIXES.some((p) => tag.startsWith(p))) {
            continue;
        }
        blocs.add(tag);
    }
    return { blocs };
}
