import type { SQL } from "bun";
import { join } from "node:path";
import {
    buildSupabaseMigrationFenceRegistrationSql,
    buildSupabaseMigrationPhaseSql,
    buildSupabaseMigrationRuntimeSchemaSql,
    loadSupabaseMigrationAssets,
    loadSupabaseRepeatableAssets,
    type SupabaseMigrationExecution,
} from "@bernouy/cms-integrations/supabase";
import { applyExactDependencies, applyTargetMigration, installMigrationSource } from "./execution";
import { readMatrixState, readMigrationLedger } from "./state";
import type { LoadedMigrationPackage, TargetMigrationConnector } from "./types";

type ProbeInput = Parameters<typeof import("./execution").executeMigrationMatrix>[0] & {
    source: LoadedMigrationPackage;
    target: LoadedMigrationPackage;
    connector: TargetMigrationConnector;
};

export async function runLedgerSafetyProbes(input: ProbeInput) {
    const migrationAndLedgerAtomic = await atomicityProbe(input);
    const checksumMismatchRejected = await checksumProbe(input);
    const emptyLedgerRejected = await emptyLedgerProbe(input);
    return { migrationAndLedgerAtomic, checksumMismatchRejected, emptyLedgerRejected };
}

async function atomicityProbe(input: ProbeInput): Promise<boolean> {
    await prepareSource(input);
    const before = await readMatrixState(input.database, input.selection, input.target, input.connector);
    const rowsBefore = await readMigrationLedger(input.database, input.migration);
    const sql = await firstMigrationPhaseSql(input);
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
    return (
        rejected && before.stateDigest === after.stateDigest && JSON.stringify(rowsBefore) === JSON.stringify(rowsAfter)
    );
}

async function checksumProbe(input: ProbeInput): Promise<boolean> {
    await prepareSource(input);
    const descriptor = nextMigration(input);
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

async function firstMigrationPhaseSql(input: ProbeInput): Promise<string> {
    const descriptor = nextMigration(input);
    const root = join(input.target.root, input.connector.connector.root ?? ".");
    const migrations = await loadSupabaseMigrationAssets(root, [descriptor]);
    const repeatables =
        descriptor.phase === "expand"
            ? await loadSupabaseRepeatableAssets(root, input.connector.plan.repeatables ?? [])
            : [];
    const execution = migrationExecution(input);
    await input.database.unsafe(buildSupabaseMigrationRuntimeSchemaSql());
    const deployment = {
        connectorKey: input.migration.connectorKey,
        lineageId: input.migration.lineageId,
        connectorInstanceId: `verification-${input.migration.connectorKey}`,
        migrationRevision: input.migration.sourceMigrationRevision,
        plan: input.connector.plan,
    };
    await input.database.unsafe(
        buildSupabaseMigrationFenceRegistrationSql({
            integrationKind: input.migration.target.kind,
            migration: deployment,
            execution,
        }),
    );
    return buildSupabaseMigrationPhaseSql({
        integrationKind: input.migration.target.kind,
        version: input.migration.target.version,
        provider: "supabase",
        migration: deployment,
        migrations,
        repeatables,
        execution,
        finalizeTargetPackageDigest: descriptor.phase === "contract",
    });
}

function nextMigration(input: ProbeInput) {
    const descriptor = input.connector.plan.migrations.find(
        (entry) => entry.toRevision > input.migration.sourceMigrationRevision,
    );
    if (!descriptor) {
        throw new TypeError("Migration proof has no source-to-target migration descriptor");
    }
    return descriptor;
}

function migrationExecution(input: ProbeInput): SupabaseMigrationExecution {
    return {
        sourcePackageDigest: input.migration.source.packageDigest,
        targetPackageDigest: input.migration.target.packageDigest,
        operationId: `verification-${input.attempt.jobId}`,
        attemptId: input.attempt.attemptId,
        fencingToken: input.attempt.fencingToken,
    };
}

function postgresError(error: unknown, code: string, message: string): boolean {
    return (
        error instanceof Error &&
        (error as Error & { errno?: unknown }).errno === code &&
        error.message.includes(message)
    );
}
