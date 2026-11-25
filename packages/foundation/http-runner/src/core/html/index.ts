/**
 * Escapes the five HTML-significant characters. Use everywhere a user-
 * provided string is interpolated into a template — labels, display names,
 * error messages, etc.
 */
export function escapeHtml(str: string): string {
    return str
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

export function htmlResponse(html: string, status = 200): Response {
    return new Response(html, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}

export function redirect(location: string, status = 302): Response {
    return new Response(null, { status, headers: { Location: location } });
}
