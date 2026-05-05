/**
 * CORS helpers for the broker → frontière C upload flow. The browser runs
 * on a different origin than the CDN (`https://app.example.com` posting to
 * `https://cdn.example.com/upload?token=…`), so the response MUST carry the
 * matching `Access-Control-Allow-Origin` header — both on the preflight
 * `OPTIONS` and on the actual `POST`.
 *
 * The allowlist lives on the bucket and is snapshotted into the upload
 * token at mint time — both `originAllowed` and the headers below take the
 * token's snapshot, never re-read the bucket.
 */

/** Returns true when the request origin matches the token's allowlist. */
export function originAllowed(origin: string | null, allowed: string[] | undefined): boolean {
    if (!origin) return true;                        // same-origin / non-browser, no CORS check
    if (!allowed || allowed.length === 0) return false;
    if (allowed.includes("*")) return true;
    return allowed.includes(origin);
}

/** Builds the CORS headers to attach to the response when the origin is allowed. */
export function corsHeaders(origin: string | null, allowed: string[] | undefined): Record<string, string> {
    if (!origin) return {};                          // no Origin → no CORS headers needed
    const useWildcard = !!allowed && allowed.includes("*") && !allowed.includes(origin);
    return {
        "Access-Control-Allow-Origin":  useWildcard ? "*" : origin,
        "Vary":                         "Origin",
    };
}
