import type { Endpoint } from "../interfaces/Gateway";
import { buildUpstreamUrl } from "./buildUpstreamUrl";

/** For test/infra injection only (default = global `fetch`). Not a capability carrier. */
export type ExecutorDeps = { fetchImpl?: typeof fetch };

const TIMEOUT_MS = 15_000;
const REQUEST_ALLOWLIST  = ["accept", "accept-language", "content-type", "range"] as const;
const RESPONSE_ALLOWLIST = ["content-type", "cache-control", "etag", "last-modified", "content-length", "content-encoding"] as const;

/**
 * Executor proxy (step 0). Takes an ALREADY resolved `Endpoint` + the incoming
 * request, builds the upstream call and forwards it.
 *
 *  - Upstream URL: path/query from `input.params` (see `buildUpstreamUrl`);
 *  - Request headers: allowlist (accept / accept-language / content-type / range)
 *    + header-params; never cookie / authorization / host / hop-by-hop;
 *  - Response headers: allowlist; `set-cookie` / `access-control-*` / hop-by-hop dropped;
 *  - Timeout 15 s, body streamed without buffering; redirects NOT followed.
 *
 * `rules` are NOT applied at step 0: an endpoint that declares any is considered
 * misconfigured → 500 (pluggable seam).
 */
export async function executeEndpoint(
    endpoint: Endpoint,
    request: Request,
    deps?: ExecutorDeps,
): Promise<Response> {
    if (endpoint.rules.length > 0) {
        return new Response(`endpoint "${endpoint.urn}" déclare des rules, non appliquées à l'étape 0`, { status: 500 });
    }

    const built = buildUpstreamUrl(endpoint, new URL(request.url).searchParams);
    if (!built.ok) return new Response(built.message, { status: built.status });

    // Request: start from an EMPTY Headers object (inbound cookie / authorization never leak).
    const fwd = new Headers();
    for (const name of REQUEST_ALLOWLIST) {
        const v = request.headers.get(name);
        if (v !== null) fwd.set(name, v);
    }
    for (const [name, value] of Object.entries(built.headers)) {
        try { fwd.set(name, value); }
        catch { return new Response(`header-param invalide : "${name}"`, { status: 400 }); }
    }

    const hasBody = endpoint.method !== "GET" && endpoint.method !== "HEAD" && request.body != null;

    const doFetch = deps?.fetchImpl ?? fetch;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

    let upstream: Response;
    try {
        const init: RequestInit & { duplex?: "half" } = {
            method:   endpoint.method,
            headers:  fwd,
            redirect: "manual",
            signal:   ac.signal,
        };
        if (hasBody) { init.body = request.body; init.duplex = "half"; }
        upstream = await doFetch(built.url, init);
    } catch (err) {
        const aborted = (err as { name?: string })?.name === "AbortError";
        return new Response(aborted ? "Gateway Timeout" : "Bad Gateway", { status: aborted ? 504 : 502 });
    } finally {
        clearTimeout(timer);
    }

    const out = new Headers();
    for (const name of RESPONSE_ALLOWLIST) {
        const v = upstream.headers.get(name);
        if (v !== null) out.set(name, v);
    }
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}
