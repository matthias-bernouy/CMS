import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../queries/types";
import type { Observation } from "../../../harness/clients/types";

export function collectionReview(
    value: unknown,
    target: Readonly<Record<string, unknown>>,
    before: Readonly<Record<string, unknown>>,
) {
    const row = requireRecord(value);
    assertCondition(
        row.status === "applicable" && row.issueCount === 0 && Array.isArray(row.issues) && row.issues.length === 0,
    );
    assertCondition(row.expectedRevision === before.revision);
    assertCondition(typeof row.planDigest === "string" && /^sha256:[a-f0-9]{64}$/u.test(row.planDigest));
    assertCondition(typeof row.usageDigest === "string" && /^sha256:[a-f0-9]{64}$/u.test(row.usageDigest));
    assertCondition(canonicalizeIJson(row.references) === canonicalizeIJson([target]));
    assertCondition(
        Array.isArray(row.source) &&
            row.source.some((value) => {
                const source = requireRecord(value);
                return (
                    source.collectionId === target.collectionId &&
                    source.version === "1.0.0" &&
                    source.digest === before.digest
                );
            }),
    );
    // These two authored releases differ only in version; no resources are added or removed.
    assertCondition(Array.isArray(row.resources) && row.resources.length === 0 && row.resourceCount === 0);
    return row;
}

export function completedCollectionUpgrade(value: unknown, revision: number, expectedId?: unknown) {
    const row = requireRecord(value);
    assertCondition(row.status === "completed" && row.collectionRevision === revision);
    assertCondition(typeof row.upgradeId === "string" && /^sha256:[a-f0-9]{64}$/u.test(row.upgradeId));
    assertCondition(expectedId === undefined || row.upgradeId === expectedId);
    return row;
}

/** A changed payload with the same receipt key conflicts before upgrade business execution. */
export function assertCollectionReplayConflict(observation: Observation, binding: string) {
    assertCondition(
        !observation.validated &&
            observation.streamConsumed &&
            (binding === "mcp"
                ? observation.status === 200 && observation.failure === "mcp-declared-IDEMPOTENCY_CONFLICT"
                : observation.status === 409 && observation.failure === "http-status-409"),
        "collection-recovery-conflicting-replay",
    );
}
