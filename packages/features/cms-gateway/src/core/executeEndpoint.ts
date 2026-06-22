import type { Endpoint } from "../interfaces/Gateway";
import type { ResolveJwtClaimsDeps } from "./jwt/claims";
import { signJwtHeaderValue } from "./jwt/signJwtHeader";
import { buildUpstreamUrl } from "./buildUpstreamUrl";
import { isForbiddenHeaderName } from "./headerPolicy";

/**
 * Injected dependencies for the executor.
 *  - `fetchImpl`: test/infra override of the upstream call (default = global `fetch`).
 *  - `resolveSecret`: resolves a `secret`-sourced config header's `ref` to its value
 *    server-side. When provided, `secret` headers ARE applied; when absent, the
 *    executor keeps the 500 seam (a raw `${KEY}` ref is never forwarded upstream).
 */
export type ExecutorDeps = {
    fetchImpl?: typeof fetch;
    resolveSecret?: (ref: string) => Promise<string | undefined>;
} & ResolveJwtClaimsDeps;

const TIMEOUT_MS = 15_000;
const REQUEST_ALLOWLIST  = ["accept", "accept-language", "content-type", "range"] as const;
// `fetch` transparently DECOMPRESSES the upstream body, so the re-served body is
// plain — NEVER forward `content-encoding`/`content-length` (they describe the
// upstream's compressed bytes; a client would then fail to gunzip / truncate).
// The runtime sets the correct length for the streamed body.
const RESPONSE_ALLOWLIST = ["content-type", "cache-control", "etag", "last-modified"] as const;

/**
 * Executor proxy (step 0). Takes an ALREADY resolved `Endpoint` + the incoming
 * request, builds the upstream call and forwards it.
 *
 *  - Upstream URL: path/query from `input.params` (see `buildUpstreamUrl`);
 *  - Request headers: inbound allowlist (accept / accept-language / content-type /
 *    range) — inbound cookie / authorization / host / hop-by-hop never leak — then
 *    header-params, then config `endpoint.headers` (config wins, last `.set`). A
 *    config header named `authorization` IS allowed (the 'never authorization'
 *    rule applies only to INBOUND forwarding); forbidden/hop-by-hop names are skipped.
 *  - `secret`-sourced config headers are NOT applied: they return 500 (the scoped
 *    seam — a raw `${KEY}` ref is never forwarded upstream until the store is wired).
 *  - Response headers: allowlist; `set-cookie` / `access-control-*` / hop-by-hop dropped;
 *  - Timeout 15 s, body streamed without buffering; redirects NOT followed.
 */
export async function executeEndpoint(
    endpoint: Endpoint,
    request: Request,
    deps?: ExecutorDeps,
): Promise<Response> {
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
    // Config headers win over forwarded ones (last `.set`). Defense-in-depth: skip
    // forbidden names (the parser already drops them). Secret refs are resolved via
    // `deps.resolveSecret` when wired; without it → 500 (never forward a raw ref).
    for (const { name, source } of endpoint.headers ?? []) {
        if (isForbiddenHeaderName(name)) continue;
        if (source.from === "secret") {
            if (!deps?.resolveSecret) {
                return new Response(`secret header requires a configured secret store (not wired yet): ${name}`, { status: 500 });
            }
            const v = await deps.resolveSecret(source.ref);
            if (v == null) return new Response(`secret introuvable : ${source.ref}`, { status: 500 });
            try { fwd.set(name, v); }
            catch { return new Response(`header invalide : "${name}"`, { status: 400 }); }
            continue;
        }
        if (source.from === "jwt") {
            const signed = await signJwtHeaderValue(source, request, deps ?? {});
            if (!signed.ok) return new Response(signed.message, { status: signed.status });
            try { fwd.set(name, signed.value); }
            catch { return new Response(`header invalide : "${name}"`, { status: 400 }); }
            continue;
        }
        try { fwd.set(name, source.value); }
        catch { return new Response(`header invalide : "${name}"`, { status: 400 }); }
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
