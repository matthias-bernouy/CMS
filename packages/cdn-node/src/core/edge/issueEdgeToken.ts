import { createHash, randomBytes } from "node:crypto";

/**
 * Mint a fresh bearer token for an edge. Returns the plaintext (to show
 * to the operator once) and its sha256 hash (to persist).
 *
 * Format: `bsedge_<43 base64url chars>` — 32 bytes of entropy, prefix
 * matching the existing `bsp_*` / `bspa_*` family used by
 * `BucketCredential` so operators can tell tokens apart at a glance.
 *
 * The plaintext is the only artefact that ever lets an edge call
 * `/edge-api/*`. We never store it: a lost token means the operator
 * deletes the edge row and re-adds it.
 */
const TOKEN_BYTES  = 32;
const TOKEN_PREFIX = "bsedge_";

export type IssuedEdgeToken = { plaintext: string; hash: string };

export function issueEdgeToken(): IssuedEdgeToken {
    const raw       = randomBytes(TOKEN_BYTES).toString("base64url");
    const plaintext = `${TOKEN_PREFIX}${raw}`;
    const hash      = hashEdgeToken(plaintext);
    return { plaintext, hash };
}

/** sha256 hex of an edge bearer token. Stable across calls. */
export function hashEdgeToken(plaintext: string): string {
    return createHash("sha256").update(plaintext).digest("hex");
}
