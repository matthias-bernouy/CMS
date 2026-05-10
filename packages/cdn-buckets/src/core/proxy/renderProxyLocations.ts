import type { BucketProxy } from "../../interfaces/entities/BucketProxy";
import { compileRulesConfig } from "./codegen/compileRulesConfig";

const MAX_BODY_SIZE = "50m";

/**
 * Per-proxy nginx baseline: forwarded request metadata, cookie scoping,
 * 3xx Location rewriting, streaming + large body. Repeated in each
 * generated location because nginx does NOT inherit `proxy_set_header`
 * from a parent location once any are declared at the inner level.
 */
function baselineDirectives(providerId: string): string[] {
    const prefix   = `/.cms/data/${providerId}`;
    const trailing = `${prefix}/`;
    return [
        `proxy_http_version 1.1;`,
        `proxy_set_header X-Real-IP          $remote_addr;`,
        `proxy_set_header X-Forwarded-For    $proxy_add_x_forwarded_for;`,
        `proxy_set_header X-Forwarded-Proto  $scheme;`,
        `proxy_set_header X-Forwarded-Host   $host;`,
        `proxy_set_header X-Forwarded-Prefix ${prefix};`,
        // WebSocket upgrade — `$connection_upgrade` is set by a `map` in
        // the parent http {} context (see docker/cdn-edge/nginx.conf).
        `proxy_set_header Upgrade            $http_upgrade;`,
        `proxy_set_header Connection         $connection_upgrade;`,
        // Cookie scoping: rewrite Path on Set-Cookie so providers don't
        // see each other's cookies; rewrite Domain to the visible host.
        `proxy_cookie_path   ~^(/.*)$ ${trailing}$1;`,
        `proxy_cookie_domain ~.+ $host;`,
        // 3xx Location: /foo → /.cms/data/<providerId>/foo so relative
        // redirects from the upstream don't escape the proxy surface.
        `proxy_redirect      ~^/(.*)$ ${trailing}$1;`,
        `proxy_buffering          off;`,
        `proxy_request_buffering  off;`,
        `client_max_body_size     ${MAX_BODY_SIZE};`,
    ];
}

/**
 * Emit the nginx fragment for every proxy in the list. Each proxy
 * yields the rule-specific locations (compiled from `rules`) plus a
 * fallback catch-all (emitted by compileRulesConfig with `defaults`
 * applied, so e.g. an `inject_header Authorization Bearer …` defined
 * once in `defaults` covers BOTH path-specific rules AND uncovered
 * paths). Secret values are read at runtime via `os.getenv` inside
 * per-location `set_by_lua_block` — the rendered fragment never
 * carries plaintext.
 */
export function renderProxyLocations(proxies: BucketProxy[]): string {
    return proxies.map(renderOne).join("\n\n");
}

function renderOne(proxy: BucketProxy): string {
    const baseline = baselineDirectives(proxy.providerId);
    const compiled = compileRulesConfig(proxy.rules, {
        bucketId:     proxy.bucketId,
        providerId:   proxy.providerId,
        server:       proxy.server,
        baseline,
        emitFallback: true,
    });
    return compiled.nginx;
}

