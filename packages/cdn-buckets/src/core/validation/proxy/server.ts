/**
 * Validate the upstream URL that a proxy forwards to. Constraints:
 * - Must parse as an absolute URL.
 * - Scheme must be http or https.
 * - No query string (auth is in headers, not the URL).
 * - No fragment (irrelevant server-side).
 * - No userinfo (`https://user:pass@…`) — credentials must use the auth
 *   field of the proxy entity, not be smuggled in the URL.
 */
export function assertValidProxyServer(value: unknown): asserts value is string {
    if (typeof value !== "string") {
        throw new TypeError("Proxy server must be a string.");
    }
    let url: URL;
    try { url = new URL(value); }
    catch { throw new Error("Proxy server must be a valid absolute URL."); }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Proxy server must use http or https.");
    }
    if (url.search.length > 0)   throw new Error("Proxy server URL must not include a query string.");
    if (url.hash.length > 0)     throw new Error("Proxy server URL must not include a fragment.");
    if (url.username.length > 0) throw new Error("Proxy server URL must not include credentials — use auth.");
}
