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
 */
export function renderProxyLocations(proxies: BucketProxy[]): string {
    return proxies.map(renderOne).join("\n");
}

function renderOne(proxy: BucketProxy): string {
    const headers = renderAuthHeaders(proxy);
    const target  = ensureTrailingSlash(proxy.server);
    const path    = `/.cms/data/${proxy.providerId}/`;
    return [
        `location ${path} {`,
        ...headers.map((h) => `    ${h}`),
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
