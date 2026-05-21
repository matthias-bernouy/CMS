import { z } from "zod";

/**
 * THE single source of the data-provider wire contract, consumed by BOTH
 * `@bernouy/data-provider-sdk` (verify side) and `@bernouy/issuer-kit`
 * (sign side) so they cannot drift. Depends on nothing but `zod` (no cycle).
 * Spec: `.claude/official-data-providers/base.md` §4.3 / §4.4 / §4.6 / §4.8.
 */

/** Wire-contract version (RFC 8414 metadoc field below). Distinct from any
 *  npm package version. Negotiated by major (base.md §4.4). */
export const DATA_PROVIDER_CONTRACT_VERSION = "1.0";

/** The RFC 8414 metadoc field carrying the contract version. */
export const METADOC_VERSION_FIELD = "data_provider_contract_version";

/** Log wire (base.md §10.2 / §10). Bumped independently of the contract
 *  version; the hub reads these versions to parse log records. */
export const LOG_SCHEMA_VERSION = "1";
export const EVENT_CATALOG_VERSION = "1";

/** §4.6 crypto profile — the ONE place sign & verify agree on it. */
export const CRYPTO_DEFAULTS = {
    algorithms:       ["ES256"] as const,
    tokenTtlSeconds:  120,
    tokenTtlMin:      60,
    tokenTtlMax:      300,
    clockSkewSeconds: 30,
    clockSkewMax:     120,
} as const;

/** §4.4 / §4.8 discovery profile — cache lifetimes for the verify side.
 *  Defaults; ProviderConfig may override per-deployment. */
export const DISCOVERY_DEFAULTS = {
    /** Metadoc cache TTL (seconds). */
    metadocTtlSeconds: 300,
    /** JWKS cache lifetime (ms) — passed to `jose.createRemoteJWKSet`. */
    jwksCacheMaxAgeMs: 300_000,
    /** Network timeout for remote JWKS fetches (ms). */
    jwksTimeoutMs:     5_000,
    /** Negative-cache window after an unknown-kid refresh (ms). */
    jwksNegativeTtlMs: 5_000,
} as const;

/**
 * Where the RFC 8414 metadoc lives for a given `iss` — **append** convention
 * (NOT host-root). This single helper is what locks sign↔verify to the same
 * path. `iss` trailing slash tolerated.
 */
export function metadocPath(iss: string): string {
    return `${iss.replace(/\/$/, "")}/.well-known/oauth-authorization-server`;
}

/** Both sides need to assert that `jwks_uri` (verify) or its default config
 *  (sign) is same-origin as the `issuer` — the anti-SSRF / anti-cross-origin
 *  rule the contract owns. */
export function sameOrigin(a: string, b: string): boolean {
    try { return new URL(a).origin === new URL(b).origin; }
    catch { return false; }
}

/** Default wall clock in epoch seconds. Use only at composition roots; pass
 *  the function as a dep so tests can inject a fake clock. */
export function defaultClock(): number {
    return Math.floor(Date.now() / 1000);
}

/** Token claims — base.md §4.3. No `tenant`/`role` claim. */
export interface TokenClaims {
    iss: string;
    aud: string;
    sub?: string;
    iat: number;
    exp: number;
    jti: string;
}

/** Runtime validator. Not `.strict()`: extra standard claims (`nbf`…) ok. */
export const TokenClaimsSchema = z.object({
    iss: z.string().url(),
    aud: z.string().min(1),
    sub: z.string().min(1).optional(),
    iat: z.number().int(),
    exp: z.number().int(),
    jti: z.string().min(1),
});

export type TokenClaimsParsed = z.infer<typeof TokenClaimsSchema>;
