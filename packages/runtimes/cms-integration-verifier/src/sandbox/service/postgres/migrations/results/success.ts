import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    identifyMigrationVerificationInput,
    validateMigrationJobResultForInput,
    type MigrationJobResultV1,
    type MigrationVerificationInputV1,
} from "@bernouy/cms-integration-verification";
import type { MatrixMigrationEvidence, MigrationVerificationExecutionInput } from "../types";
import { targetObservation, unsupportedCutover, unsupportedEvidence } from "./evidence";

export async function successfulResult(
    input: MigrationVerificationInputV1,
    attempt: MigrationVerificationExecutionInput["attempt"],
    environmentDigest: string,
    matrices: readonly MatrixMigrationEvidence[],
): Promise<MigrationJobResultV1> {
    const identified = await identifyMigrationVerificationInput(input);
    const evidenceDigests = [...new Set(matrices.flatMap((entry) => entry.evidenceDigests))].toSorted();
    const freshStateDigest = await aggregateDigest(matrices, "fresh", "stateDigest");
    const migratedStateDigest = await aggregateDigest(matrices, "migrated", "stateDigest");
    const replayStateDigest = await aggregateDigest(matrices, "replay", "stateDigest");
    const freshSchemaDigest = await aggregateDigest(matrices, "fresh", "schemaDigest");
    const migratedSchemaDigest = await aggregateDigest(matrices, "migrated", "schemaDigest");
    const freshDataDigest = await aggregateDigest(matrices, "fresh", "dataDigest");
    const migratedDataDigest = await aggregateDigest(matrices, "migrated", "dataDigest");
    const projectionDiagnostics = input.migrationPlan.plan.equivalence?.dataProjections.length
        ? ["database-clock-default-projection-applied"]
        : [];
    const differences = equivalenceDifferences(matrices);
    const ledgerRows = requireSameLedger(matrices);
    const ledgerPassed = matrices.every(
        (entry) =>
            entry.freshBaselineRecorded &&
            entry.migrationAndLedgerAtomic &&
            entry.checksumMismatchRejected &&
            entry.emptyLedgerRejected,
    );
    const replayStateUnchanged = matrices.every(
        (entry) =>
            entry.migrated.stateDigest === entry.replay.stateDigest &&
            sameCanonicalValue(entry.ledgerRows, entry.replayLedgerRows),
    );
    const result: MigrationJobResultV1 = {
        schema: "cms.integration.migration-job-result.v1",
        ...attempt,
        migrationInputDigest: identified.digest,
        runnerDigest: input.runner.digest,
        environmentDigest,
        observations: {
            freshTarget: targetObservation(freshStateDigest, freshSchemaDigest, freshDataDigest, evidenceDigests, [
                ...projectionDiagnostics,
                "edge-functions-not-covered",
                "edge-functions-not-executed",
                "sql-only-fresh-install",
            ]),
            migratedTarget: targetObservation(
                migratedStateDigest,
                migratedSchemaDigest,
                migratedDataDigest,
                evidenceDigests,
                [
                    ...projectionDiagnostics,
                    "edge-functions-not-covered",
                    "edge-functions-not-executed",
                    "sql-only-source-to-target",
                ],
            ),
            equivalence: {
                status: differences.length === 0 ? "passed" : "failed",
                evidenceDigests,
                diagnosticCodes: [
                    ...projectionDiagnostics,
                    "edge-functions-not-covered",
                    "edge-functions-not-executed",
                    "sql-schema-and-data-equivalence",
                ],
                freshStateDigest,
                migratedStateDigest,
                equivalent: differences.length === 0,
                differences,
            },
            ledger: {
                status: ledgerPassed ? "passed" : "failed",
                evidenceDigests,
                diagnosticCodes: ["database-local-ledger-proof"],
                sourceRevision: input.sourceMigrationRevision,
                targetRevision: input.targetMigrationRevision,
                freshBaselineRecorded: matrices.every((entry) => entry.freshBaselineRecorded),
                migrationAndLedgerAtomic: matrices.every((entry) => entry.migrationAndLedgerAtomic),
                checksumMismatchRejected: matrices.every((entry) => entry.checksumMismatchRejected),
                emptyLedgerRejected: matrices.every((entry) => entry.emptyLedgerRejected),
                rows: ledgerRows,
            },
            replay: ledgerPassed
                ? {
                      status: replayStateUnchanged ? "passed" : "failed",
                      evidenceDigests,
                      diagnosticCodes: ["sql-only-reapply-proof"],
                      firstStateDigest: migratedStateDigest,
                      replayStateDigest,
                      unchanged: replayStateUnchanged,
                      ledgerRowsBefore: matrices[0]?.ledgerRowsBefore ?? 0,
                      ledgerRowsAfterFirstRun: ledgerRows.length,
                      ledgerRowsAfterReplay: matrices[0]?.replayLedgerRows.length ?? 0,
                  }
                : unsupportedEvidence("ledger-safety-proof-failed"),
            failureInjections: [],
            resumptions: [],
            cutover: unsupportedCutover(input, "not-supported"),
        },
    };
    return (await validateMigrationJobResultForInput(result, input, attempt)).result;
}

async function aggregateDigest(
    matrices: readonly MatrixMigrationEvidence[],
    branch: "fresh" | "migrated" | "replay",
    field: "stateDigest" | "schemaDigest" | "dataDigest",
): Promise<string> {
    return await sha256Hex(
        canonicalJsonBytes(matrices.map((entry) => ({ selection: entry.selection, digest: entry[branch][field] }))),
    );
}

function equivalenceDifferences(
    matrices: readonly MatrixMigrationEvidence[],
): MigrationJobResultV1["observations"]["equivalence"]["differences"] {
    const differences: MigrationJobResultV1["observations"]["equivalence"]["differences"][number][] = [];
    for (const entry of matrices) {
        if (entry.fresh.dataDigest !== entry.migrated.dataDigest) {
            differences.push({
                surface: "data",
                path: `dependency-matrix/${entry.selection}/owned-tables`,
                freshDigest: entry.fresh.dataDigest,
                migratedDigest: entry.migrated.dataDigest,
            });
        }
        if (entry.fresh.schemaDigest !== entry.migrated.schemaDigest) {
            differences.push({
                surface: "schema",
                path: `dependency-matrix/${entry.selection}/declared-schema`,
                freshDigest: entry.fresh.schemaDigest,
                migratedDigest: entry.migrated.schemaDigest,
            });
        } else if (
            entry.fresh.dataDigest === entry.migrated.dataDigest &&
            entry.fresh.stateDigest !== entry.migrated.stateDigest
        ) {
            differences.push({
                surface: "schema",
                path: `dependency-matrix/${entry.selection}/canonical-catalog`,
                freshDigest: entry.fresh.stateDigest,
                migratedDigest: entry.migrated.stateDigest,
            });
        }
    }
    return differences.toSorted((left, right) =>
        `${left.surface}\0${left.path}`.localeCompare(`${right.surface}\0${right.path}`),
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
