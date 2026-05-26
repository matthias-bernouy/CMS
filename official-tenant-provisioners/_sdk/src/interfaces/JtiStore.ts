/**
 * Replay-protection store for `jti` over a token's lifetime (base.md §4.5
 * step 7). Pluggable. The default is in-memory → best-effort, per-instance
 * (a `jti` could still pass on a 2nd instance within the ≤ TTL window);
 * bounded by the short TTL + `aud` binding. A shared store can replace it
 * later without touching this contract (cf. .work/_sdk decisions).
 *
 * `claim` is the ONE operation, and it MUST be atomic: a check-then-record
 * split would let two concurrent verifications of the same token both pass
 * (replay race). Implementations keep the test-and-set in a single critical
 * section.
 */
export interface JtiStore {
    /** Atomically record `jti` as used until `expiresAtSec` (epoch seconds).
     *  Returns `false` if it was ALREADY claimed (replay), `true` on first
     *  use — single-use even under concurrent verification. */
    claim(jti: string, expiresAtSec: number): Promise<boolean>;
}
