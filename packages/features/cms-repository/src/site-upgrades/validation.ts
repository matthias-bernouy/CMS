import { canonicalIJsonBytes, canonicalizeIJson } from "cms-repository/exports/contracts/protocol";
import type { SiteUpgradeIntent } from "./interfaces";

export function validateUpgradeIntent(intent: SiteUpgradeIntent<unknown>): void {
    if (canonicalIJsonBytes(intent, 64).byteLength > 8 * 1024 * 1024) {
        throw new TypeError("Site upgrade intent exceeds its byte limit");
    }
    if (
        ![intent.id, intent.planDigest, intent.sourceStateDigest, intent.targetStateDigest].every((value) =>
            /^sha256:[0-9a-f]{64}$/.test(value),
        ) ||
        !intent.siteId ||
        intent.siteId.length > 128 ||
        !/^[a-z][a-z0-9-]{0,63}$/.test(intent.kind) ||
        !Number.isSafeInteger(intent.expectedRevision) ||
        intent.expectedRevision < 0 ||
        intent.status !== "prepared"
    ) {
        throw new TypeError("Invalid site upgrade intent");
    }
}
export function sameUpgradeIntent(a: SiteUpgradeIntent<unknown>, b: SiteUpgradeIntent<unknown>): boolean {
    const { createdAt: _a, status: _statusA, ...left } = a;
    const { createdAt: _b, status: _statusB, ...right } = b;
    return canonicalizeIJson(left) === canonicalizeIJson(right);
}
