import { getMetaBasePath } from "src/control/core/dom/meta/getMetaBasePath";
import type { TDataProviderListItem } from "src/socle/interfaces/Data/data";

type ProviderRef = { id: string; server: string };

/**
 * Re-route bloc fetches that hit a registered Data Provider to the
 * editor's mock endpoint, so authoring renders deterministic data instead
 * of touching the real API. Anything outside a provider's server URL
 * passes through unchanged — the admin UI's own fetches are unaffected.
 *
 * The provider list is loaded once at install via the saved original
 * fetch (no recursion). Until that load resolves, every call passes
 * through; the editor remounts per page, so the list refreshes naturally.
 *
 * Mock contract — POST `<basePath>/api/data/mock` with
 * `{ providerId, method, url }`, expects JSON back. This proxy carries no
 * schema knowledge; URL→operation matching and mock generation live
 * server-side.
 */
export function installFetchProxy(): () => void {
    const originalFetch = window.fetch.bind(window);
    const basePath = getMetaBasePath();
    let providers: ProviderRef[] = [];

    originalFetch(`${basePath}/api/data/providers`)
        .then(r => r.ok ? r.json() : [])
        .then((list: unknown) => {
            if (!Array.isArray(list)) return;
            providers = list
                .map(p => ({
                    id:     (p as TDataProviderListItem).id,
                    server: ((p as TDataProviderListItem).server ?? "").replace(/\/+$/, ""),
                }))
                .filter(p => p.id && p.server);
        })
        .catch(() => { /* offline / auth — keep empty list, everything passes through */ });

    const proxy = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url    = resolveUrl(input);
        const method = resolveMethod(input, init);
        const match  = providers.find(p => urlMatchesServer(url, p.server));
        if (!match) return originalFetch(input as RequestInfo, init);

        return originalFetch(`${basePath}/api/data/mock`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ providerId: match.id, method, url }),
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

function urlMatchesServer(url: string, server: string): boolean {
    if (!server || !url.startsWith(server)) return false;
    const next = url[server.length];
    return next === undefined || next === "/" || next === "?" || next === "#";
}
