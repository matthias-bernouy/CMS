/**
 * Escape a string for safe interpolation inside HTML text or a double-quoted
 * attribute value. Use this anywhere a DB/user-sourced value is concatenated
 * into an `innerHTML` / template-literal HTML string — without it, fields like
 * `snippet.name` act as a stored-XSS vector.
 */
export function escapeHtml(value: unknown): string {
    if (value === null || value === undefined) return "";
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
