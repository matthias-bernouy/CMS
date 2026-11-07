import type { StoredContractSelections } from "@bernouy/ulvia-providers/selections";
import { createHash } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";

export function ticketHash(ticket: string) {
    return createHash("sha256").update(`ulvia-delegation-v1\0${ticket}`).digest("hex");
}
export function fingerprint(value: unknown) {
    return createHash("sha256").update(canonicalizeIJson(value)).digest("hex");
}

/** Mutable authorization identity excludes the expanded review inventory. */
export function selectionFingerprint(value: StoredContractSelections): string {
    return fingerprint({
        siteId: value.siteId,
        revision: value.revision,
        dependencyRevision: value.dependencyRevision,
        grants: value.grants,
        selections: value.plan.selections,
    });
}
