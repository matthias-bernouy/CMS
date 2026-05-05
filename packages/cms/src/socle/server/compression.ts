import { CryptoHasher, gzipSync } from "bun";
import { brotliCompressSync } from "node:zlib";
import type { Cache, CacheEntry } from "src/socle/interfaces/Cache";

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
export const SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Strict-Transport-Security": "max-age=31536000",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    ...(process.env.MODE === "DEV"
        ? { "Cross-Origin-Opener-Policy-Report-Only": "same-origin" }
        : { "Cross-Origin-Opener-Policy":            "same-origin" }),
    "Cross-Origin-Resource-Policy": "same-origin",
} as const;

/**
 * CSP applied to HTML responses only (it is meaningless on JS/CSS/image
 * responses — CSP governs how the *loading* document may fetch sub-resources,
 * so it belongs on the document itself).
 *
 * Report-Only mode: violations are logged to the browser console but nothing
 * is actually blocked. The goal of this phase is observation — we want to
 * discover which inline styles / innerHTML patterns / external sources would
 * break under an enforcing policy before switching over.
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
 */
/**
 * `style-src 'self' 'unsafe-inline'` is pragmatic: every Web Component in
 * this codebase ships its shadow-DOM CSS via an inline `<style>` tag inside
 * its template (and configuration panels use `style="..."` attributes).
 * Hashing each style block is impractical because bloc authors add new
 * components constantly. Inline *styles* can't execute JS, so the residual
 * risk is a style-only injection (CSS-based phishing) — accepted tradeoff.
 * Inline *scripts* remain forbidden via the stricter default-src 'self'.
 *
 * `img-src 'self' data: https:` lets blocs reference external images (CDN
 * assets, placeholders like picsum, OpenGraph previews). Images can't
 * execute code, so the residual risk is privacy (visitor IP leaked to the
 * image host) — accepted for CMS flexibility. Restricted to `https:` to
 * prevent mixed-content downgrades. `data:` covers inline base64 images.
 *
 * Now ENFORCING (not Report-Only): any violation actually blocks the load.
 * Keep this in mind when adding features — an inline `<script>` or a
 * cross-origin asset will silently break the page until this policy is
 * extended.
 */
export const HTML_CSP_HEADER = {
    "Content-Security-Policy":
        "default-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "base-uri 'self'; form-action 'self'; " +
        "object-src 'none'; frame-ancestors 'none'",
} as const;

function withCspIfHtml(contentType: string): Record<string, string> {
    if (!contentType.startsWith("text/html")) return {};
    return HTML_CSP_HEADER;
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
    if (process.env.MODE === "DEV") return "no-cache, no-store, must-revalidate";
    const hasVersion = new URL(req.url).searchParams.has("v");
    return hasVersion
        ? "public, max-age=31536000, immutable"
        : "no-cache, must-revalidate";
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

/**
 * Returns the cache entry for `key`, generating it on miss. Shared by
 * `cachedResponse(Async)` (which builds a Response on top) and by renderers
 * that only need the entry's hash to emit content-addressed URLs without
 * actually sending the bytes to the client.
 */
export function getOrGenerateEntry(
    key: string,
    cache: Cache,
    generate: () => CacheEntry
): CacheEntry {
    let entry = cache.get(key);
    if (!entry) {
        entry = generate();
        cache.set(key, entry);
    }
    return entry;
}

export async function getOrGenerateEntryAsync(
    key: string,
    cache: Cache,
    generate: () => Promise<CacheEntry>
): Promise<CacheEntry> {
    let entry = cache.get(key);
    if (!entry) {
        entry = await generate();
        cache.set(key, entry);
    }
    return entry;
}

export function cachedResponse(
    req: Request,
    key: string,
    cache: Cache,
    generate: () => CacheEntry,
    cacheControl?: string
): Response {
    return sendCompressed(req, getOrGenerateEntry(key, cache, generate), cacheControl);
}

export async function cachedResponseAsync(
    req: Request,
    key: string,
    cache: Cache,
    generate: () => Promise<CacheEntry>,
    cacheControl?: string
): Promise<Response> {
    return sendCompressed(req, await getOrGenerateEntryAsync(key, cache, generate), cacheControl);
}

export function sendCompressed(req: Request, entry: CacheEntry, cacheControl?: string): Response {
    const accept = req.headers.get("accept-encoding") || "";

    const csp = withCspIfHtml(entry.contentType);
    const cc: Record<string, string> = cacheControl ? { "Cache-Control": cacheControl } : {};

    if (accept.includes("br")) {
        return new Response(entry.brotli as BodyInit, {
            headers: {
                "Content-Type": entry.contentType,
                "Content-Encoding": "br",
                ...SECURITY_HEADERS,
                ...csp,
                ...cc,
            },
        });
    }

    if (accept.includes("gzip")) {
        return new Response(entry.gzip as BodyInit, {
            headers: {
                "Content-Type": entry.contentType,
                "Content-Encoding": "gzip",
                ...SECURITY_HEADERS,
                ...csp,
                ...cc,
            },
        });
    }

    return new Response(entry.raw as BodyInit, {
        headers: {
            "Content-Type": entry.contentType,
            ...SECURITY_HEADERS,
            ...csp,
            ...cc,
        },
    });
}
