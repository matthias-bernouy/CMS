/**
 * Escape the five HTML-significant characters (`& < > " '`) for safe
 * interpolation into an `innerHTML` / template-literal string — correct for
 * both text content and double-quoted attribute values. Pure string ops, so it
 * is safe in browser-bundled components. Canonical escaper for cms-control's
 * web components; mirrors `@bernouy/core`'s server-side `escapeHtml`.
 */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** Alias of {@link escapeHtml}; escaping all five characters is safe in a
 *  double-quoted attribute context too, so text and attribute escaping share
 *  one implementation. */
export const escapeAttr = escapeHtml;
