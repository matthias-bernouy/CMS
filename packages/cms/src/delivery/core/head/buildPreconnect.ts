/**
 * Preconnect hints for external domains referenced by a page (fonts host,
 * external CDN, analytics, …). No-op for now — Delivery does not yet track
 * external dependencies per page. Kept as a dedicated entry point so the
 * renderer pipeline stays stable when we wire this up.
 */
export function buildPreconnect(
    _document: Document,
    _head: HTMLElement,
): void {
    // Intentionally empty — see file header.
}
