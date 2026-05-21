/**
 * Issuer configuration (pure type; validated + defaulted in
 * `core/schemas/issuerConfig.ts`). Crypto profile comes from the shared
 * contract (`CRYPTO_DEFAULTS`) — never redeclared here.
 */
export interface IssuerConfig {
    /** Exact `iss` — MUST equal the token `iss` byte-for-byte (base.md §4.4). */
    issuer:           string;
    /** Default `${issuer}/jwks.json`; MUST be same-origin as `issuer`. */
    jwksUri:          string;
    algorithms:       string[];
    tokenTtlSeconds:  number;
    /** Publish-before-sign overlap; ≥ tokenTtlMax + skew (base.md §4.8). */
    keyOverlapSeconds: number;
}
