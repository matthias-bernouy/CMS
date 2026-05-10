import type { BucketProxy } from "../../interfaces/entities/BucketProxy";
import { placeholderName } from "./placeholderName";

const MAX_BODY_SIZE = "50m"; // Hardcoded for now; per-proxy override later when needed.

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
 * Each emitted block carries everything needed to make a transparent
 * reverse-proxy work for the broad set of upstream patterns:
 *
 *  Cookies & session
 *    - `proxy_cookie_path` rewrites `Path=…` on `Set-Cookie` so upstream
 *      cookies stay scoped to `/.cms/data/<providerId>/` — providers
 *      on the same alias never see each other's cookies.
 *    - `proxy_cookie_domain` rewrites `Domain=` to `$host` so cookies
 *      whose Domain attribute targets the upstream's hostname (which the
 *      browser would otherwise reject as a domain mismatch) become
 *      host-only on the visible alias.
 *
 *  Forwarded request metadata
 *    - `Host` request header stays as the upstream's hostname (nginx
 *      default with `proxy_pass`). Most APIs route on it.
 *    - `X-Forwarded-Host` exposes the visible alias for OAuth callbacks,
 *      `redirect_uri` builders, etc.
 *    - `X-Forwarded-Prefix` exposes the proxy path so proxy-aware
 *      frameworks (Spring Boot, FastAPI, …) generate correct prefixed
 *      URLs in their HTML/JSON responses.
 *
 *  Response shape
 *    - `proxy_redirect` rewrites absolute-path Location headers (e.g.
 *      `Location: /dashboard`) so 3xx responses don't escape the proxy.
 *    - `proxy_buffering off` lets SSE / long-polling streams flow chunk
 *      by chunk instead of being held back by nginx.
 *    - `proxy_request_buffering off` does the same for upload bodies.
 *    - `client_max_body_size` raises the default 1 MiB cap.
 *
 *  WebSockets
 *    - `Upgrade` + `Connection` headers carry the WS handshake. The
 *      `$connection_upgrade` map MUST be defined in the http {} context
 *      of the parent nginx config (see `docker/cdn-edge/nginx.conf.template`).
 */
export function renderProxyLocations(proxies: BucketProxy[]): string {
    return proxies.map(renderOne).join("\n");
}

function renderOne(proxy: BucketProxy): string {
    const target = ensureTrailingSlash(proxy.server);
    const path   = `/.cms/data/${proxy.providerId}/`;
    const prefix = `/.cms/data/${proxy.providerId}`; // no trailing slash for X-Forwarded-Prefix
    return [
        `location ${path} {`,
        // HTTP/1.1 baseline (required for keepalive + WS upgrade).
        `    proxy_http_version 1.1;`,
        // Forwarded request metadata.
        `    proxy_set_header X-Real-IP          $remote_addr;`,
        `    proxy_set_header X-Forwarded-For    $proxy_add_x_forwarded_for;`,
        `    proxy_set_header X-Forwarded-Proto  $scheme;`,
        `    proxy_set_header X-Forwarded-Host   $host;`,
        `    proxy_set_header X-Forwarded-Prefix ${prefix};`,
        // WebSocket upgrade. `$connection_upgrade` is set by a `map` in
        // the parent nginx http {} context.
        `    proxy_set_header Upgrade            $http_upgrade;`,
        `    proxy_set_header Connection         $connection_upgrade;`,
        // Cookie scoping — see file-level comment.
        `    proxy_cookie_path   ~^(/.*)$ ${path}$1;`,
        `    proxy_cookie_domain ~.+ $host;`,
        // 3xx Location: /foo → /.cms/data/<providerId>/foo so relative
        // redirects from the upstream don't escape the proxy surface.
        `    proxy_redirect      ~^/(.*)$ ${path}$1;`,
        // Streaming / large bodies.
        `    proxy_buffering          off;`,
        `    proxy_request_buffering  off;`,
        `    client_max_body_size     ${MAX_BODY_SIZE};`,
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
