import type { Endpoint } from "../interfaces/Gateway";

export type BuildUpstream =
    | { ok: true;  url: string; headers: Record<string, string> }
    | { ok: false; status: 400 | 500 | 502; message: string };

/** The `{name}` placeholder grammar of `targetUrl` — what this module substitutes. */
const PATH_PLACEHOLDER = /\{(\w+)\}/g;

/** The `{name}` placeholders of a `targetUrl`, deduped in URL order. Each is a
 *  DERIVED required `in:'path'` param — the config side builds its param list
 *  from this so a posted param can never shadow a placeholder. */
export function extractPathParamNames(targetUrl: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const m of targetUrl.matchAll(PATH_PLACEHOLDER)) {
        const name = m[1]!;
        if (seen.has(name)) continue;
        seen.add(name);
        out.push(name);
    }
    return out;
}

/**
 * Builds the upstream URL for an endpoint from the incoming input values (read
 * from the public request's query string). PURE.
 *
 *  - params `in:'path'`   → substituted into the `{name}` placeholders of `targetUrl`, **encoded**
 *    (a value therefore cannot inject a `/` or change the host) ;
 *  - params `in:'query'`  → appended to the upstream query string (encoded by URLSearchParams) ;
 *  - params `in:'header'` → returned in `headers` (set by the executor).
 *
 * Only DECLARED params are forwarded (undeclared query params are ignored).
 * A missing `required` param → 400 ; an unfilled `{x}` placeholder → 500.
 * SSRF guard: the resolved origin must remain the one declared by `targetUrl`.
 */
export function buildUpstreamUrl(endpoint: Endpoint, incoming: URLSearchParams): BuildUpstream {
    const pathValues = new Map<string, string>();
    const queryParams: [string, string][] = [];
    const headers: Record<string, string> = {};

    for (const p of endpoint.input?.params ?? []) {
        const value = incoming.get(p.name);
        if (value === null) {
            if (p.required) return { ok: false, status: 400, message: `paramètre requis manquant : "${p.name}"` };
            continue;
        }
        if (p.in === "path")       pathValues.set(p.name, value);
        else if (p.in === "query") queryParams.push([p.name, value]);
        else                       headers[p.name] = value;   // in: "header"
    }

    let path = endpoint.targetUrl;
    for (const [name, value] of pathValues) {
        path = path.replaceAll(`{${name}}`, encodeURIComponent(value));
    }
    if (/\{[^}]+\}/.test(path)) {
        return { ok: false, status: 500, message: `placeholder non rempli dans targetUrl : "${endpoint.targetUrl}"` };
    }

    let target: URL;
    let baseOrigin: string;
    try {
        target     = new URL(path);
        baseOrigin = new URL(endpoint.targetUrl.replace(/\{[^}]+\}/g, "_")).origin;
    } catch {
        return { ok: false, status: 500, message: `targetUrl invalide : "${endpoint.targetUrl}"` };
    }

    for (const [name, value] of queryParams) target.searchParams.append(name, value);

    if (target.origin !== baseOrigin) {
        return { ok: false, status: 502, message: `cible hors de l'origine déclarée (${baseOrigin})` };
    }

    return { ok: true, url: target.toString(), headers };
}
