import { CryptoHasher, gzipSync } from "bun";
import { brotliCompressSync } from "node:zlib";
import type { Cache, CacheEntry } from "http-runner/interfaces/Cache";
import { getOrGenerateEntry, getOrGenerateEntryAsync } from "http-runner/core/cacheGeneration";
import { buildCspContent, type CspExtras } from "./buildCspContent";

export { getOrGenerateEntry, getOrGenerateEntryAsync } from "http-runner/core/cacheGeneration";

/**
 * Static security headers applied to every compressed response.
 *
 * - nosniff: prevents MIME-type confusion on user-uploaded media.
 * - HSTS (1y, no includeSubDomains): forces HTTPS on future hits;
 *   omitting includeSubDomains lets plain-HTTP subdomains keep working.
 * - X-Frame-Options DENY: no iframes anywhere in this codebase, so
 *   clickjacking via <iframe> is always a bug.
 * - Referrer-Policy strict-origin-when-cross-origin: leaks only the
 *   origin (not the path/query) to third parties.
 * - Permissions-Policy: disables browser APIs we never use, so a
 *   DOM-XSS payload can't invoke them either.
 * - COOP same-origin: isolates our window from any cross-origin
 *   popup's opener reference (Spectre / tabnabbing mitigation). In DEV
 *   (`MODE=DEV`) we emit the `-Report-Only` variant instead: local dev
 *   runs over plain HTTP on a non-localhost origin (e.g. `192.168.x.x`)
 *   which browsers treat as untrustworthy, so the enforcing header
 *   would be ignored anyway and pollute the console with a warning.
 * - CORP same-origin: an external site can't load our bloc bundles,
 *   theme CSS or media through <script>/<img>/<link> tags. Tradeoff:
 *   external blogs can't hotlink our images either — acceptable for a
 *   CMS where the same instance also serves the published pages.
 */
// Built lazily (via `securityHeaders()`) instead of as a top-level constant
// because the COOP variant depends on `process.env.MODE`, which a CLI may
// set after this module is already imported (ES module imports are hoisted
// above any statement-level assignment in the importing file).
export function securityHeaders(): Record<string, string> {
    return {
        "X-Content-Type-Options": "nosniff",
        "Strict-Transport-Security": "max-age=31536000",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        ...(process.env.MODE === "DEV"
            ? { "Cross-Origin-Opener-Policy-Report-Only": "same-origin" }
            : { "Cross-Origin-Opener-Policy": "same-origin" }),
        "Cross-Origin-Resource-Policy": "same-origin",
    };
}

/**
 * CSP applied to HTML responses only (it is meaningless on JS/CSS/image
 * responses — CSP governs how the *loading* document may fetch sub-resources,
 * so it belongs on the document itself).
 *
 * Directives chosen to be as strict as possible so *any* real-world deviation
 * surfaces:
 * - default-src 'self': no external sub-resource by default
 * - base-uri 'self': forbid <base href=evil> rewrite of relative URLs
 * - form-action 'self': forbid <form action=https://evil> exfil
 * - object-src 'none': no <object>/<embed>/<applet>
 * - frame-ancestors 'none': superset of X-Frame-Options: DENY
 *
 * Add a `report-uri` (or `report-to` group) once a collector endpoint exists.
 *
 * `style-src 'self' 'unsafe-inline'` is pragmatic: every Web Component in
 * this codebase ships its shadow-DOM CSS via an inline `<style>` tag inside
 * its template (and configuration panels use `style="..."` attributes).
 * Hashing each style block is impractical because bloc authors add new
 * components constantly. Inline *styles* can't execute JS, so the residual
 * risk is a style-only injection (CSS-based phishing) — accepted tradeoff.
 * Inline *scripts* remain forbidden via the stricter default-src 'self'.
 *
 * `img-src 'self' data: https: blob:` lets blocs reference external images (CDN
 * assets, placeholders like picsum, OpenGraph previews). Images can't
 * execute code, so the residual risk is privacy (visitor IP leaked to the
 * image host) — accepted for CMS flexibility. Restricted to `https:` to
 * prevent mixed-content downgrades. `data:` covers inline base64 images.
 *
 * Production: ENFORCING — any violation actually blocks the load. Keep this
 * in mind when adding features: an inline `<script>` or a cross-origin asset
 * will silently break the page until this policy is extended.
 *
 * DEV (`MODE=DEV`): emitted as `Content-Security-Policy-Report-Only`. Local
 * dev typically references cross-origin assets (CDN fonts, dev-time
 * placeholders) whose hosts cannot all be listed pre-deploy — Report-Only
 * keeps violations visible in the console without breaking the editor.
 */
// Lazy for the same reason as `securityHeaders()`: header name flips with
// `process.env.MODE`, which the CLI may set after import.
function cspHeaderName(): string {
    return process.env.MODE === "DEV" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

export function htmlCspHeader(): Record<string, string> {
    return { [cspHeaderName()]: buildCspContent() };
}

/**
 * Per-call CSP header for HTML responses. Falls back to the baseline
 * (extras-empty) header when the caller doesn't provide extras.
 */
function buildCspHeaderForEntry(contentType: string, extras?: CspExtras): Record<string, string> {
    if (!contentType.startsWith("text/html")) {
        return {};
    }
    if (!extras) {
        return htmlCspHeader();
    }
    return { [cspHeaderName()]: buildCspContent(extras) };
}

/**
 * Cache-Control for public static-ish assets (bloc bundles, theme CSS,
 * component.js).
 *
 * - DEV (`MODE=DEV`): `no-store` — the in-memory server cache is also
 *   bypassed, so edits are immediately visible.
 * - Prod, hashed URL (`?v=<hash>` present): `immutable` + 1 year. The
 *   hash is the invalidation mechanism — any content change produces a
 *   new hash, hence a new URL, so the old bytes at the old URL can stay
 *   in browser caches forever without ever being referenced again.
 *   `renderPage` injects these hashes; visitors only ever reach hashed
 *   URLs.
 * - Prod, non-hashed URL: `no-cache` (always revalidate). The editor
 *   shell and the dev CLI still reference `/bloc?tag=X` without a hash
 *   because they need the freshest bloc every time — a bloc being
 *   actively edited must never be served from stale cache.
 */
export function publicAssetCacheControl(req: Request): string {
    // DEV: drop `no-store` so the browser keeps the response in its disk
    // cache. `no-cache, must-revalidate` still forces a conditional request
    // on every load — `sendCompressed` answers `304 Not Modified` against
    // the entry's ETag when the build hasn't changed, which turns a
    // ~1 MB transfer into a ~0-byte revalidation. SSE live-reload still
    // forces a full page reload on bloc rebuild, so no risk of stale UI.
    if (process.env.MODE === "DEV") {
        return "no-cache, must-revalidate";
    }
    const hasVersion = new URL(req.url).searchParams.has("v");
    return hasVersion ? "public, max-age=31536000, immutable" : "no-cache, must-revalidate";
}

export function compress(raw: string | ArrayBuffer | Uint8Array, contentType: string): CacheEntry {
    const rawBytes = typeof raw === "string" ? new TextEncoder().encode(raw) : new Uint8Array(raw);
    const brotliResult = brotliCompressSync(rawBytes);

    // 10 hex chars = 40 bits of sha256. Collision-resistant enough for a
    // cache-busting token: a collision would only cause a single stale asset
    // for one specific content pair, not a correctness bug.
    const hash = new CryptoHasher("sha256").update(rawBytes).digest("hex").slice(0, 10);

    return {
        raw: rawBytes,
        brotli: new Uint8Array(brotliResult.buffer, brotliResult.byteOffset, brotliResult.byteLength),
        gzip: new Uint8Array(gzipSync(rawBytes)),
        contentType,
        hash,
    };
}

export function cachedResponse(
    req: Request,
    key: string,
    cache: Cache,
    generate: () => CacheEntry,
    cacheControl?: string,
    opts?: SendCompressedOptions,
): Response {
    return sendCompressed(req, getOrGenerateEntry(key, cache, generate), cacheControl, opts);
}

export async function cachedResponseAsync(
    req: Request,
    key: string,
    cache: Cache,
    generate: () => Promise<CacheEntry>,
    cacheControl?: string,
    opts?: SendCompressedOptions,
): Promise<Response> {
    return sendCompressed(req, await getOrGenerateEntryAsync(key, cache, generate), cacheControl, opts);
}

/**
 * `skipCspHeader` — caller asserts the HTML response carries its own CSP
 * via `<meta http-equiv>` (delivery-rendered pages do this). Setting both
 * a header CSP and a meta CSP would AND-intersect them, blocking what one
 * side allows; the meta-only path is the single source of truth there.
 *
 * `cspExtras` — when present (and the response is HTML), build the CSP
 * header dynamically with the provided extras instead of the empty-extras
 * baseline. Used by the admin static-page path to whitelist the CDN
 * origin + any settings extras without resorting to a separate meta tag.
 *
 * `status` — HTTP status for the body response. Conditional requests still
 * return 304 when the ETag matches.
 */
export type SendCompressedOptions = {
    skipCspHeader?: boolean;
    cspExtras?: CspExtras;
    status?: number;
};

type Encoding = "br" | "gzip" | "identity";

function responseEncoding(accept: string): Encoding {
    if (accept.includes("br")) {
        return "br";
    }
    if (accept.includes("gzip")) {
        return "gzip";
    }
    return "identity";
}

function assertBodyStatus(status: number): void {
    if (status < 200 || status > 599 || status === 204 || status === 205 || status === 304) {
        throw new RangeError(`sendCompressed status must allow a response body, got ${status}`);
    }
}

function etagFor(hash: string, encoding: Encoding): string {
    return `"${hash}-${encoding}"`;
}

function representationHeaders(entry: CacheEntry, encoding: Encoding, etag: string): Record<string, string> {
    return {
        "Content-Type": entry.contentType,
        ...(encoding === "identity" ? {} : { "Content-Encoding": encoding }),
        "Vary": "Accept-Encoding",
        ETag: etag,
    };
}

function bodyFor(entry: CacheEntry, encoding: Encoding): BodyInit {
    if (encoding === "br") {
        return entry.brotli as BodyInit;
    }
    if (encoding === "gzip") {
        return entry.gzip as BodyInit;
    }
    return entry.raw as BodyInit;
}

export function sendCompressed(
    req: Request,
    entry: CacheEntry,
    cacheControl?: string,
    opts?: SendCompressedOptions,
): Response {
    const accept = req.headers.get("accept-encoding") || "";
    const encoding = responseEncoding(accept);

    const csp = opts?.skipCspHeader ? {} : buildCspHeaderForEntry(entry.contentType, opts?.cspExtras);
    const cc: Record<string, string> = cacheControl ? { "Cache-Control": cacheControl } : {};
    const common = { ...securityHeaders(), ...csp, ...cc };
    const status = opts?.status ?? 200;
    assertBodyStatus(status);

    // Conditional GET — answer 304 when the client already has the
    // current representation. The entry's `hash` is a stable digest of the raw
    // bytes (cf. `compress()`), suffixed by encoding so strong ETags don't
    // identify different wire representations as identical. Pairs
    // with the relaxed `Cache-Control` for DEV: the browser keeps a
    // disk-cached copy, sends `If-None-Match` on every load, and we
    // skip the body entirely when nothing changed.
    const etag = etagFor(entry.hash, encoding);
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === etag) {
        return new Response(null, {
            status: 304,
            headers: {
                "Vary": "Accept-Encoding",
                ETag: etag,
                ...common,
            },
        });
    }

    return new Response(bodyFor(entry, encoding), {
        status,
        headers: {
            ...representationHeaders(entry, encoding, etag),
            ...common,
        },
    });
}
