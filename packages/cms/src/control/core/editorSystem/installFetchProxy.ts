import { getMetaBasePath } from "src/control/core/dom/meta/getMetaBasePath";
import { parseDataProxyUrl } from "src/socle/constants/p9r-constants";

/**
 * Re-route bloc fetches that hit the data-provider proxy path to the
 * editor's mock endpoint, so authoring renders deterministic data
 * instead of touching the real API. Anything outside the proxy shape
 * `<DATA_PROXY_PREFIX>/<providerId>/...` passes through unchanged — the
 * admin UI's own fetches are unaffected.
 *
 * Mock contract — POST `<basePath>/api/data/mock` with
 * `{ providerId, method, path }`. The proxy path carries the providerId
 * and the operation path together, so no provider list lookup or
 * upstream URL stripping is required client-side.
 */
export function installFetchProxy(): () => void {
    const originalFetch = window.fetch.bind(window);
    const basePath = getMetaBasePath();

    const proxy = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url    = resolveUrl(input);
        const method = resolveMethod(input, init);
        const match  = parseDataProxyUrl(url);
        if (!match) return originalFetch(input as RequestInfo, init);

        return originalFetch(`${basePath}/api/data/mock`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ providerId: match.providerId, method, path: match.path }),
        });
    }) as typeof window.fetch;

    window.fetch = proxy;

    return () => {
        if (window.fetch === proxy) window.fetch = originalFetch;
    };
}

function resolveUrl(input: RequestInfo | URL): string {
    if (typeof input === "string") return new URL(input, location.href).href;
    if (input instanceof URL)      return input.href;
    return input.url;
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
    if (init?.method) return init.method.toUpperCase();
    if (input instanceof Request) return input.method.toUpperCase();
    return "GET";
}
