/**
 * Escape the regex metacharacters in `s` so it can be embedded literally inside
 * a `RegExp` / Mongo `$regex` pattern. Without it a user-supplied value like
 * `a.b*` would act as a wildcard (or break the pattern). Used by the repository
 * search + snippet-reference scans.
 */
export function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
