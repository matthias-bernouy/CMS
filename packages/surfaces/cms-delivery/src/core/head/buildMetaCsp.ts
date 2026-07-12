import { buildCspContent, type CspExtras } from "@bernouy/http-runner";

/**
 * Inject the page's `Content-Security-Policy` as a `<meta http-equiv>` tag
 * at the very top of `<head>`. Meta-borne CSP applies from its position in
 * document order, so it must precede every preload / stylesheet / script
 * the rest of the head builders emit.
 *
 * Why a meta tag (instead of a response header):
 *   - Pre-rendered pages are uploaded to a static CDN bucket; the bucket
 *     server (nginx) doesn't know about data providers and can't emit a
 *     dynamic CSP header per page. The meta travels with the HTML.
 *   - The runtime serving path could send a header too, but having both
 *     would AND-intersect them — extras allowed by the meta would be
 *     re-blocked by a stricter header. Single source of truth = meta.
 *
 * Header-only directives (`frame-ancestors`, `report-uri`, `sandbox`)
 * cannot ride in a meta. Equivalent protection is provided by the static
 * `X-Frame-Options: DENY` header in `SECURITY_HEADERS` (compression.ts)
 * and, in production, by the nginx-level static security headers.
 */
export function buildMetaCsp(
    document: Document,
    head: HTMLElement,
    extras: CspExtras,
): void {
    // `<meta http-equiv="Content-Security-Policy-Report-Only">` is silently
    // ignored by browsers (per spec). In DEV the response header already
    // ships a Report-Only CSP — emitting an enforcing meta here would
    // re-enforce the policy on pre-rendered pages and re-block cross-origin
    // assets (fonts, etc.) that DEV explicitly wants to tolerate.
    if (process.env.MODE === "DEV") return;
    const meta = document.createElement("meta");
    meta.setAttribute("http-equiv", "Content-Security-Policy");
    meta.setAttribute("content",    buildCspContent(extras, { includeHeaderOnlyDirectives: false }));
    head.prepend(meta);
}
