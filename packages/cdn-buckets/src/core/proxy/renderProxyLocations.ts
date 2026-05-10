import type { BucketProxy } from "../../interfaces/entities/BucketProxy";
import { placeholderName } from "./placeholderName";

/**
 * Emit the nginx `location { … }` blocks for a bucket's proxy rules.
 * Output is purely structural: secret values are referenced via
 * `${SECRET_<hex>}` placeholders that `envsubst` resolves at edge reload
 * time. The plaintext never appears in this string.
 *
 * Caller MUST pass already-validated proxies — header names are emitted
 * verbatim, so any unsafe character would break the surrounding nginx
 * directive. Validation lives in `core/proxy/upsertProxy.ts`.
 *
 * The proxied URI scheme:
 *   browser → `acme.com/.cms/data/<providerId>/<rest>`
 *   nginx   → `<server>/<rest>` (location prefix stripped via the
 *             trailing slash on `proxy_pass`).
 *
 * Cookie & forwarded-host semantics (every emitted block):
 *  - `proxy_cookie_path` rewrites `Path=…` on `Set-Cookie` responses so
 *    upstream cookies stay scoped to `/.cms/data/<providerId>/` —
 *    different providers on the same alias never see each other's
 *    cookies. Set-Cookie without an explicit `Path=` falls back to RFC
 *    6265 default-path, which is already inside the proxy scope, so
 *    the rewrite is a defensive net for upstreams that emit `Path=/`
 *    or other broad paths.
 *  - `proxy_cookie_domain` rewrites the `Domain=` attribute to `$host`
 *    (the visible alias). Without this, upstreams that set
 *    `Domain=api.upstream.com` would have their cookies rejected by
 *    the browser (mismatch with the visible alias).
 *  - `Host` request header stays as the upstream's hostname (nginx
 *    default with `proxy_pass`) — most APIs route on it. The visible
 *    alias is exposed to the upstream via `X-Forwarded-Host` for
 *    upstreams that need it (OAuth callbacks, redirect URL builders).
 */
export function renderProxyLocations(proxies: BucketProxy[]): string {
    return proxies.map(renderOne).join("\n");
}

function renderOne(proxy: BucketProxy): string {
    const target = ensureTrailingSlash(proxy.server);
    const path   = `/.cms/data/${proxy.providerId}/`;
    return [
        `location ${path} {`,
        // Standard proxy hygiene
        `    proxy_http_version 1.1;`,
        `    proxy_set_header X-Real-IP         $remote_addr;`,
        `    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;`,
        `    proxy_set_header X-Forwarded-Proto $scheme;`,
        `    proxy_set_header X-Forwarded-Host  $host;`,
        // Cookie scoping — see the file-level comment for the reasoning.
        `    proxy_cookie_path   ~^(/.*)$ ${path}$1;`,
        `    proxy_cookie_domain ~.+ $host;`,
        // Per-proxy auth (bearer / custom headers).
        ...renderAuthHeaders(proxy).map((h) => `    ${h}`),
        `    proxy_pass ${target};`,
        `}`,
    ].join("\n");
}

function renderAuthHeaders(proxy: BucketProxy): string[] {
    if (proxy.auth.type === "none")   return [];
    if (proxy.auth.type === "bearer") {
        const ref = "${" + placeholderName(proxy.bucketId, proxy.providerId, 0) + "}";
        return [`proxy_set_header Authorization "Bearer ${ref}";`];
    }
    // headers
    return proxy.auth.headers.map((h, i) => {
        const ref = "${" + placeholderName(proxy.bucketId, proxy.providerId, i) + "}";
        return `proxy_set_header ${h.name} "${ref}";`;
    });
}

function ensureTrailingSlash(url: string): string {
    return url.endsWith("/") ? url : url + "/";
}
