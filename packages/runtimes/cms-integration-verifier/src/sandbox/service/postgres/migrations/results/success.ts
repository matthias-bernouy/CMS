import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    identifyMigrationVerificationInput,
    validateMigrationJobResultForInput,
    type MigrationJobResultV1,
    type MigrationVerificationInputV1,
} from "@bernouy/cms-integration-verification";
import type { MatrixMigrationEvidence, MigrationVerificationExecutionInput } from "../types";
import { targetObservation, unsupportedCutover, unsupportedEvidence } from "./evidence";
import { assessLedger } from "./ledger";

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
    const projectionDiagnostics = [
        ...new Set(
            (input.migrationPlan.plan.equivalence?.dataProjections ?? []).map(
                (projection) => `${projection.kind}-projection-applied`,
            ),
        ),
    ].toSorted();
    const differences = equivalenceDifferences(matrices);
    const ledger = assessLedger(input, matrices, evidenceDigests);
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
            ledger: ledger.observation,
            replay: ledger.replaySafetyPassed
                ? {
                      status: ledger.replayStateUnchanged ? "passed" : "failed",
                      evidenceDigests,
                      diagnosticCodes: ["sql-only-reapply-proof"],
                      firstStateDigest: migratedStateDigest,
                      replayStateDigest,
                      unchanged: ledger.replayStateUnchanged,
                      ledgerRowsBefore: matrices[0]?.ledgerRowsBefore ?? 0,
                      ledgerRowsAfterFirstRun: ledger.rows.length,
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
