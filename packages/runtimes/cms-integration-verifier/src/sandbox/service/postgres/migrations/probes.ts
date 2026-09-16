import type { SQL } from "bun";
import { applyExactDependencies } from "./execution/dependencies";
import type { ExecuteMigrationMatrixInput } from "./execution";
import { installMigrationSource } from "./execution/install";
import { buildFirstMigrationPhaseSql, pendingMigration } from "./execution/probePhase";
import { applyTargetMigration } from "./execution/target";
import { readMatrixState, readMigrationLedger, readRepeatableLedger } from "./state";
import type { LoadedMigrationPackage, TargetMigrationConnector } from "./types";

type ProbeInput = ExecuteMigrationMatrixInput & {
    source: LoadedMigrationPackage;
    target: LoadedMigrationPackage;
    connector: TargetMigrationConnector;
};

export async function runLedgerSafetyProbes(input: ProbeInput) {
    const migrationAndLedgerAtomic = await atomicityProbe(input);
    if (!pendingMigration(input)) {
        return {
            ledgerSafety: {
                kind: "repeatable-only" as const,
                repeatableAndLedgerAtomic: migrationAndLedgerAtomic,
            },
        };
    }
    const checksumMismatchRejected = await checksumProbe(input);
    const emptyLedgerRejected = await emptyLedgerProbe(input);
    return {
        ledgerSafety: {
            kind: "numbered" as const,
            migrationAndLedgerAtomic,
            checksumMismatchRejected,
            emptyLedgerRejected,
        },
    };
}

async function atomicityProbe(input: ProbeInput): Promise<boolean> {
    await prepareSource(input);
    const before = await readMatrixState(input.database, input.selection, input.target, input.connector);
    const rowsBefore = await readMigrationLedger(input.database, input.migration);
    const repeatableRowsBefore = await readRepeatableLedger(input.database, input.migration);
    const sql = await buildFirstMigrationPhaseSql(input);
    const injectedSql = sql.replace(/\nCOMMIT;\s*$/u, "\nSELECT 1 / 0;\nCOMMIT;");
    if (injectedSql === sql) {
        throw new Error("Migration atomicity probe could not place its transaction failure boundary");
    }
    let rejected = false;
    try {
        await input.database.unsafe(injectedSql);
    } catch (error) {
        rejected = postgresError(error, "22012", "division by zero");
        await input.database.unsafe("ROLLBACK").catch(() => undefined);
    }
    const after = await readMatrixState(input.database, input.selection, input.target, input.connector);
    const rowsAfter = await readMigrationLedger(input.database, input.migration);
    const repeatableRowsAfter = await readRepeatableLedger(input.database, input.migration);
    return (
        rejected &&
        before.stateDigest === after.stateDigest &&
        JSON.stringify(rowsBefore) === JSON.stringify(rowsAfter) &&
        JSON.stringify(repeatableRowsBefore) === JSON.stringify(repeatableRowsAfter)
    );
}

async function checksumProbe(input: ProbeInput): Promise<boolean> {
    await prepareSource(input);
    const descriptor = requirePendingMigration(input);
    const invalidChecksum =
        descriptor.checksum === `sha256:${"0".repeat(64)}` ? `sha256:${"1".repeat(64)}` : `sha256:${"0".repeat(64)}`;
    await input.database.unsafe(
        `insert into cms_integration_runtime.migration_ledger
            (connector_instance_id, integration_kind, connector_key, lineage_id, migration_id, provider,
             checksum, migration_revision, introduced_in, attempt_id)
         values ($1, $2, $3, $4, $5, 'supabase', $6, $7, $8, 'checksum-probe')`,
        [
            `verification-${input.migration.connectorKey}`,
            input.migration.target.kind,
            input.migration.connectorKey,
            input.migration.lineageId,
            descriptor.id,
            invalidChecksum,
            descriptor.toRevision,
            descriptor.introducedIn,
        ],
    );
    try {
        await applyTargetMigration(input.database, input.target, input.connector, input.migration, input.attempt);
        return false;
    } catch (error) {
        await input.database.unsafe("ROLLBACK").catch(() => undefined);
        return postgresError(error, "P0001", "cms integration migration checksum conflict");
    }
}

async function emptyLedgerProbe(input: ProbeInput): Promise<boolean> {
    await prepareSource(input);
    await input.database.unsafe(
        `delete from cms_integration_runtime.migration_ledger
          where integration_kind = $1 and connector_key = $2 and lineage_id = $3`,
        [input.migration.target.kind, input.migration.connectorKey, input.migration.lineageId],
    );
    await input.database.unsafe(
        `update cms_integration_runtime.connector_instances set migration_revision = $1
          where integration_kind = $2 and connector_key = $3 and lineage_id = $4`,
        [
            input.migration.targetMigrationRevision,
            input.migration.target.kind,
            input.migration.connectorKey,
            input.migration.lineageId,
        ],
    );
    try {
        await applyTargetMigration(input.database, input.target, input.connector, input.migration, input.attempt);
        return false;
    } catch (error) {
        await input.database.unsafe("ROLLBACK").catch(() => undefined);
        return postgresError(error, "P0001", "cms integration migration ledger is incomplete");
    }
}

async function prepareSource(input: ProbeInput): Promise<void> {
    await input.reset();
    await applyExactDependencies(input.database, input.loader, input.dependencies, input.signal);
    await installMigrationSource(
        input.database,
        input.source,
        input.connector,
        input.migration,
        input.attempt.attemptId,
    );
}

function requirePendingMigration(input: ProbeInput) {
    const descriptor = pendingMigration(input);
    if (!descriptor) {
        throw new TypeError("Migration proof has no source-to-target migration descriptor");
    }
    return descriptor;
}

function postgresError(error: unknown, code: string, message: string): boolean {
    return (
        error instanceof Error &&
        (error as Error & { errno?: unknown }).errno === code &&
        error.message.includes(message)
    );
}
