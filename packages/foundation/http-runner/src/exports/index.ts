/**
 * @bernouy/http-runner — the HTTP mounting seam.
 *
 * Root export = the `Runner` contract every surface mounts onto, the
 * default Bun implementation, and the runner-adjacent helpers (request-IP
 * stamping, HTML/redirect responses). Test harness lives under
 * `@bernouy/http-runner/testing`.
 */

export type { Runner, RouteHandler, Middleware } from "http-runner/interfaces/Runner";
export { BunRunner }                             from "http-runner/default-implementation/BunRunner";
export { getRequestIP, setRequestIP }            from "http-runner/core/requestIP";
export { escapeHtml, htmlResponse, redirect }    from "http-runner/core/html";

// HTTP response toolkit — caching contract, compression/negotiation, CSP.
export type { Cache, CacheEntry } from "http-runner/interfaces/Cache";
export { InMemoryCache }          from "http-runner/default-implementation/InMemoryCache";
export {
    securityHeaders, htmlCspHeader, publicAssetCacheControl,
    compress, getOrGenerateEntry, getOrGenerateEntryAsync,
    cachedResponse, cachedResponseAsync, sendCompressed, type SendCompressedOptions,
} from "http-runner/core/compression";
export { buildCspContent, type CspExtras } from "http-runner/core/buildCspContent";
