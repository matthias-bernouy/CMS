/**
 * @bernouy/http-runner — the HTTP mounting seam.
 *
 * Root export = the `Runner` contract every surface mounts onto, the
 * default Bun implementation, and the runner-adjacent helpers (request-IP
 * stamping, HTML/redirect responses). Test harness lives under
 * `@bernouy/http-runner/testing`.
 */

export type { Runner, RouteHandler, Middleware } from "http-runner/interfaces/Runner";
export type { RequestTimingClock, RequestTimingSnapshot } from "http-runner/interfaces/RequestObservability";
export { BunRunner } from "http-runner/default-implementation/BunRunner";
export { getRequestIP, setRequestIP } from "http-runner/core/request/ip";
export {
    CMS_CORRELATION_HEADER,
    MAX_REQUEST_TIMING_ENTRIES,
    SERVER_TIMING_HEADER,
    createRequestCorrelationMiddleware,
    existingRequestCorrelationId,
    finishRequestTiming,
    isValidCorrelationId,
    measureRequestTiming,
    recordRequestTiming,
    requestCorrelationId,
    requestTimingSnapshot,
    serverTimingHeader,
    withRequestCorrelationHeader,
} from "http-runner/core/request/observability";
export { escapeHtml, escapeAttr, htmlResponse, redirect } from "http-runner/core/html";

// HTTP response toolkit — caching contract, compression/negotiation, CSP.
export type { Cache, CacheEntry } from "http-runner/interfaces/Cache";
export { InMemoryCache } from "http-runner/default-implementation/InMemoryCache";
export { TtlCache } from "http-runner/default-implementation/TtlCache";
export {
    securityHeaders,
    htmlCspHeader,
    publicAssetCacheControl,
    compress,
    getOrGenerateEntry,
    getOrGenerateEntryAsync,
    cachedResponse,
    cachedResponseAsync,
    sendCompressed,
    type SendCompressedOptions,
} from "http-runner/core/compression";
export { buildCspContent, type CspExtras } from "http-runner/core/buildCspContent";
