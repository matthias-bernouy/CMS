import type { SQL } from "bun";
import type { MigrationVerificationInputV1 } from "@bernouy/cms-integration-verification";
import { requireTargetConnector, type MigrationPackageLoader } from "../packages";
import { runLedgerSafetyProbes } from "../probes";
import { readMatrixState, readMigrationLedger, targetInstanceIsExact } from "../state";
import type {
    ExactMigrationPackage,
    LoadedMigrationPackage,
    MatrixMigrationEvidence,
    TargetMigrationConnector,
} from "../types";
import { applyExactDependencies } from "./dependencies";
import { installFreshTarget, installMigrationSource } from "./install";
import { inMigrationVerificationPhase } from "./phases";
import { applyTargetMigration } from "./target";

export { applyExactDependencies } from "./dependencies";
export { installMigrationSource } from "./install";
export { applyTargetMigration } from "./target";

export type ExecuteMigrationMatrixInput = Readonly<{
    database: SQL;
    loader: MigrationPackageLoader;
    source: ExactMigrationPackage;
    target: ExactMigrationPackage;
    dependencies: readonly ExactMigrationPackage[];
    migration: MigrationVerificationInputV1;
    attempt: Readonly<{ attemptId: string; fencingToken: number; jobId: string }>;
    selection: "minimum" | "stable";
    reset(): Promise<void>;
    signal: AbortSignal;
}>;

export async function executeMigrationMatrix(input: ExecuteMigrationMatrixInput): Promise<MatrixMigrationEvidence> {
    const target = await input.loader.load(input.target);
    const source = await input.loader.load(input.source);
    const connector = await requireTargetConnector(target, input.migration);
    input.signal.throwIfAborted();

    await input.reset();
    const freshResult = await inMigrationVerificationPhase("fresh", async () => {
        await applyExactDependencies(input.database, input.loader, input.dependencies, input.signal);
        const freshBaselineRecorded = await installFreshTarget(input.database, target, connector, input.migration);
        const fresh = await readMatrixState(input.database, input.selection, target, connector);
        return { freshBaselineRecorded, fresh };
    });

    await input.reset();
    const sourceLedger = await inMigrationVerificationPhase("source", async () => {
        await applyExactDependencies(input.database, input.loader, input.dependencies, input.signal);
        await installMigrationSource(input.database, source, connector, input.migration, input.attempt.attemptId);
        const rows = await readMigrationLedger(input.database, input.migration);
        if (!sameSourceLedger(input.migration, rows)) {
            throw new Error("Migration source did not establish the exact admitted ledger prefix");
        }
        return rows;
    });
    const migrationResult = await inMigrationVerificationPhase("migration", async () => {
        await applyAndAssertExactTarget(input, target, connector);
        return {
            migrated: await readMatrixState(input.database, input.selection, target, connector),
            ledgerRows: await readMigrationLedger(input.database, input.migration),
        };
    });
    const replayResult = await inMigrationVerificationPhase("replay", async () => {
        await applyAndAssertExactTarget(input, target, connector);
        return {
            replay: await readMatrixState(input.database, input.selection, target, connector),
            replayRows: await readMigrationLedger(input.database, input.migration),
        };
    });

    const probes = await inMigrationVerificationPhase("migration", async () =>
        runLedgerSafetyProbes({ ...input, source, target, connector }),
    );
    return {
        selection: input.selection,
        fresh: freshResult.fresh,
        migrated: migrationResult.migrated,
        replay: replayResult.replay,
        ledgerRows: migrationResult.ledgerRows,
        replayLedgerRows: replayResult.replayRows,
        ledgerRowsBefore: sourceLedger.length,
        freshBaselineRecorded: freshResult.freshBaselineRecorded,
        ...probes,
        evidenceDigests: [],
    };
}

async function applyAndAssertExactTarget(
    input: ExecuteMigrationMatrixInput,
    target: LoadedMigrationPackage,
    connector: TargetMigrationConnector,
): Promise<void> {
    await applyTargetMigration(input.database, target, connector, input.migration, input.attempt);
    if (!(await targetInstanceIsExact(input.database, input.migration))) {
        throw new Error("Migration did not preserve the exact target connector instance");
    }
}

function sameSourceLedger(
    input: MigrationVerificationInputV1,
    actual: Awaited<ReturnType<typeof readMigrationLedger>>,
): boolean {
    const expected = input.migrationPlan.plan.install.coveredMigrations.filter(
        (entry) => entry.revision <= input.sourceMigrationRevision,
    );
    return (
        actual.length === expected.length &&
        actual.every((row, index) => {
            const reference = expected[index];
            return (
                row.migrationId === reference?.id &&
                row.checksum === reference.checksum &&
                row.revision === reference.revision
            );
        })
    );
}
