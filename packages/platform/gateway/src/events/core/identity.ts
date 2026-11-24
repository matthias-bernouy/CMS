import { createHash } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
export function eventFingerprint(value: unknown): string {
    return createHash("sha256").update("ulvia-event-identity/v1\0").update(canonicalizeIJson(value)).digest("hex");
}
