import { createRemoteJWKSet } from "jose";
import { DISCOVERY_DEFAULTS } from "@bernouy/data-provider-contract";

type JWKSet = ReturnType<typeof createRemoteJWKSet>;

/**
 * Per-jwks_uri remote key set. `jose.createRemoteJWKSet` does the normal
 * caching; on an unknown `kid` we additionally allow ONE forced refresh per
 * `jwksNegativeTtlMs` so a freshly-published rotation key is picked up
 * immediately (no false 401 — base.md §4.8 publish-before-sign overlap)
 * while a bogus `kid` flood still can't hammer the issuer. Cache / timeout /
 * negative-TTL all come from `DISCOVERY_DEFAULTS` (shared contract).
 *
 * The jwks_uri was already SSRF-checked by `discovery` (same-origin).
 */
export function createJwksProvider() {
    const sets = new Map<string, { set: JWKSet; lastRefresh: number }>();

    function build(uri: string): JWKSet {
        return createRemoteJWKSet(new URL(uri), {
            cacheMaxAge:     DISCOVERY_DEFAULTS.jwksCacheMaxAgeMs,
            timeoutDuration: DISCOVERY_DEFAULTS.jwksTimeoutMs,
        });
    }

    return {
        get(jwksUri: string): JWKSet {
            let e = sets.get(jwksUri);
            if (!e) { e = { set: build(jwksUri), lastRefresh: 0 }; sets.set(jwksUri, e); }
            return e.set;
        },
        /** Returns true if a refresh was performed (within the negative-cache
         *  budget), so the caller may retry verification once. */
        forceRefresh(jwksUri: string): boolean {
            const e = sets.get(jwksUri);
            const now = Date.now();
            if (e && now - e.lastRefresh < DISCOVERY_DEFAULTS.jwksNegativeTtlMs) return false;
            sets.set(jwksUri, { set: build(jwksUri), lastRefresh: now });
            return true;
        },
    };
}
