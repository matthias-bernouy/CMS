import { createHash } from "node:crypto";

/** Asset identities are domain paths; filesystem adapters store them under fixed safe names. */
export function assetFileName(assetId: string): string {
    return createHash("sha256").update(assetId, "utf8").digest("hex");
}
