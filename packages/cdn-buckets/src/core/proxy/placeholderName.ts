import { createHash } from "node:crypto";

/**
 * Deterministic env-var-safe name for a single secret value extracted
 * from a `BucketProxy.auth`. The same `(bucketId, providerId, secretIdx)`
 * triple always returns the same name — the manifest builder and the
 * nginx fragment renderer agree on what to emit without sharing state.
 *
 * `secretIdx` lets a single proxy carry several secrets:
 * - `0` — the bearer token, OR the first header value
 * - `i` — the i-th header value when `auth.type === 'headers'`
 *
 * The output format is `SECRET_<16 hex>`. Sixteen hex chars come from
 * the first 64 bits of SHA-256, well below collision territory for the
 * realistic upper bound (~10⁵ active proxies). The prefix `SECRET_`
 * makes it easy to grep and to allow-list in envsubst.
 */
export function placeholderName(bucketId: string, providerId: string, secretIdx: number = 0): string {
    const h = createHash("sha256")
        .update(`${bucketId}\0${providerId}\0${secretIdx}`)
        .digest("hex")
        .slice(0, 16)
        .toUpperCase();
    return `SECRET_${h}`;
}
