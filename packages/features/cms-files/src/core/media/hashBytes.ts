import { createHash } from "node:crypto";

/**
 * sha256 (hex) of a byte buffer. The ONE hashing recipe shared between the
 * local files registry's move-reconciliation (where the hash is a *recovery
 * key* for matching a moved file back to its uuid) and the CLI push scan's
 * change detection — keep exactly one recipe so dev and push agree on identity.
 */
export function sha256Hex(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}
