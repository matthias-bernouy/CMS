/**
 * Input to `mint()`. Aligned on the shared contract claims
 * (`@bernouy/tenant-provisioner-contract` `TokenClaims`): no `role` claim (derived
 * provider-side, base.md §4.7). `sub` only when an end user is logged in.
 */
export interface MintInput {
    iss:         string;
    aud:         string;
    sub?:        string;
    /** Defaults to the contract profile; clamped to its max (base.md §4.8). */
    ttlSeconds?: number;
}
