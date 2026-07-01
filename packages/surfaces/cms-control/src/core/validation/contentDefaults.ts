/** Initial content for a freshly-created template (before the editor's
 *  first save). Surface-side coercion default — not a domain rule. */
export const DEFAULT_TEMPLATE_CONTENT = "<p></p>";

/** Coerce a raw `tags` field (form `"a,b"` or JSON `["a","b"]`) to a string[].
 *  Pure HTTP-shape coercion; the rules (charset, length, dedupe) live in the
 *  cms-content validator applied at write time. */
export function coerceTags(raw: unknown): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map((v) => String(v));
    if (typeof raw === "string") return raw.split(",");
    return [];
}
