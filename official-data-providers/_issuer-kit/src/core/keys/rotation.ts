import type { PublishedKey } from "src/types/SigningKey";

/**
 * A retired key may be pruned once it has been out of rotation longer than
 * the overlap window (base.md §4.8 publish-before-sign: a retired key MUST
 * stay in the JWKS until every token it could have signed has expired).
 * Active keys (no `retiredAt`) are never prunable.
 */
export function isPrunable(
    key: Pick<PublishedKey, "retiredAt">,
    nowSec: number,
    overlapSeconds: number,
): boolean {
    return key.retiredAt !== undefined && nowSec > key.retiredAt + overlapSeconds;
}
