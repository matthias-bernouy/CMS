import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../queries/types";

export function contractReview(value: unknown, selections: unknown, grants: unknown) {
    const row = requireRecord(value);
    assertCondition(row.status === "applicable" && row.issueCount === 0);
    assertCondition(Array.isArray(row.issues) && row.issues.length === 0);
    assertCondition(Number.isSafeInteger(row.expectedRevision) && Number(row.expectedRevision) >= 0);
    assertCondition(typeof row.planDigest === "string" && /^sha256:[a-f0-9]{64}$/.test(row.planDigest));
    assertCondition(typeof row.usageDigest === "string" && /^sha256:[a-f0-9]{64}$/.test(row.usageDigest));
    assertCondition(canonicalizeIJson(row.selections) === canonicalizeIJson(selections));
    assertCondition(canonicalizeIJson(row.source) === canonicalizeIJson(selections));
    assertCondition(canonicalizeIJson(row.grants) === canonicalizeIJson(grants));
    const authority = requireRecord(row.authority);
    assertCondition(Array.isArray(authority.capabilities) && authority.capabilities.length > 0);
    assertCondition(Array.isArray(authority.providers) && authority.providers.length > 0);
    return row;
}

export function completedUpgrade(value: unknown, expectedRevision: number, expectedId?: unknown) {
    const row = requireRecord(value);
    assertCondition(row.status === "completed" && row.selectionRevision === expectedRevision);
    assertCondition(typeof row.upgradeId === "string" && /^sha256:[a-f0-9]{64}$/.test(row.upgradeId));
    assertCondition(expectedId === undefined || row.upgradeId === expectedId);
    return row;
}
