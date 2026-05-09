/**
 * Pure builder for the `Content-Security-Policy` directive value. Used both
 * by HTML response headers (Bun runtime) and by the `<meta http-equiv>` tag
 * baked into pre-rendered HTML (so pages keep their CSP when uploaded to a
 * static CDN whose nginx layer doesn't forward dynamic headers).
 *
 * Extras semantics:
 *   - `connectExtras` → emitted as `connect-src 'self' <urls>`. When empty
 *     the directive is omitted entirely so the browser falls back to
 *     `default-src 'self'` (current behavior).
 *   - `mediaExtras` → emitted as `media-src 'self' <urls>`. Same omission
 *     rule.
 *
 * `img-src` keeps `'self' data: https:` regardless: tightening it would
 * break every bloc that references CDN images, with no upside (images can't
 * execute code). `frame-ancestors`, `base-uri`, `form-action`, `object-src`
 * stay constant.
 */
export type CspExtras = {
    connectExtras: string[];
    mediaExtras:   string[];
};

const EMPTY_EXTRAS: CspExtras = { connectExtras: [], mediaExtras: [] };

export function buildCspContent(extras: CspExtras = EMPTY_EXTRAS): string {
    const parts = [
        "default-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
    ];
    if (extras.connectExtras.length) {
        parts.push(`connect-src 'self' ${extras.connectExtras.join(" ")}`);
    }
    if (extras.mediaExtras.length) {
        parts.push(`media-src 'self' ${extras.mediaExtras.join(" ")}`);
    }
    return parts.join("; ");
}
