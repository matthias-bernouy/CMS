import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import type { MigrationJobResultV1, MigrationVerificationInputV1 } from "@bernouy/cms-integration-verification";
import type { MatrixMigrationEvidence } from "../types";

export function assessLedger(
    input: MigrationVerificationInputV1,
    matrices: readonly MatrixMigrationEvidence[],
    evidenceDigests: readonly string[],
): Readonly<{
    rows: MigrationJobResultV1["observations"]["ledger"]["rows"];
    observation: MigrationJobResultV1["observations"]["ledger"];
    replaySafetyPassed: boolean;
    replayStateUnchanged: boolean;
}> {
    const rows = requireSameLedger(matrices);
    const repeatableOnly = isRepeatableOnlyMigration(input);
    const numberedLedgerPassed =
        !repeatableOnly &&
        matrices.every(
            (entry) =>
                entry.freshBaselineRecorded &&
                entry.ledgerSafety.kind === "numbered" &&
                entry.ledgerSafety.migrationAndLedgerAtomic &&
                entry.ledgerSafety.checksumMismatchRejected &&
                entry.ledgerSafety.emptyLedgerRejected,
        );
    const repeatableLedgerPassed =
        repeatableOnly &&
        matrices.every(
            (entry) =>
                entry.freshBaselineRecorded &&
                entry.ledgerSafety.kind === "repeatable-only" &&
                entry.ledgerSafety.repeatableAndLedgerAtomic,
        );
    return {
        rows,
        observation: repeatableOnly
            ? { status: "not-applicable", evidenceDigests: [], diagnosticCodes: [], rows: [] }
            : {
                  status: numberedLedgerPassed ? "passed" : "failed",
                  evidenceDigests,
                  diagnosticCodes: ["database-local-ledger-proof"],
                  sourceRevision: input.sourceMigrationRevision,
                  targetRevision: input.targetMigrationRevision,
                  freshBaselineRecorded: matrices.every((entry) => entry.freshBaselineRecorded),
                  migrationAndLedgerAtomic: numberedSafetyFact(matrices, "migrationAndLedgerAtomic"),
                  checksumMismatchRejected: numberedSafetyFact(matrices, "checksumMismatchRejected"),
                  emptyLedgerRejected: numberedSafetyFact(matrices, "emptyLedgerRejected"),
                  rows,
              },
        replaySafetyPassed: numberedLedgerPassed || repeatableLedgerPassed,
        replayStateUnchanged: matrices.every(
            (entry) =>
                entry.migrated.stateDigest === entry.replay.stateDigest &&
                sameCanonicalValue(entry.ledgerRows, entry.replayLedgerRows) &&
                sameCanonicalValue(entry.repeatableLedgerRows, entry.replayRepeatableLedgerRows),
        ),
    };
}

function numberedSafetyFact(
    matrices: readonly MatrixMigrationEvidence[],
    fact: "migrationAndLedgerAtomic" | "checksumMismatchRejected" | "emptyLedgerRejected",
): boolean {
    return matrices.every((entry) => entry.ledgerSafety.kind === "numbered" && entry.ledgerSafety[fact]);
}

function isRepeatableOnlyMigration(input: MigrationVerificationInputV1): boolean {
    return (
        input.sourceMigrationRevision === input.targetMigrationRevision &&
        (input.migrationPlan.plan.repeatables?.length ?? 0) > 0 &&
        !input.migrationPlan.plan.migrations.some(
            (entry) =>
                entry.toRevision > input.sourceMigrationRevision && entry.toRevision <= input.targetMigrationRevision,
        )
    );
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
    const leftBytes = canonicalJsonBytes(left);
    const rightBytes = canonicalJsonBytes(right);
    return (
        leftBytes.byteLength === rightBytes.byteLength && leftBytes.every((byte, index) => byte === rightBytes[index])
    );
}

function requireSameLedger(matrices: readonly MatrixMigrationEvidence[]) {
    const first = matrices[0]?.ledgerRows ?? [];
    const canonical = canonicalJsonBytes(first);
    if (
        matrices.some((entry) => {
            const current = canonicalJsonBytes(entry.ledgerRows);
            return (
                current.byteLength !== canonical.byteLength || current.some((byte, index) => byte !== canonical[index])
            );
        })
    ) {
        throw new Error("Dependency matrices produced different migration ledgers");
    }
    return first;
}
