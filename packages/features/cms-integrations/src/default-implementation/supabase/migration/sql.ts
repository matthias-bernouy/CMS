import type { IntegrationConnectorMigrationDeployment } from "../../../interfaces/IntegrationConnectorDeployer";
import type { LoadedSupabaseSqlSchema } from "../sql/schemaLoader";
import type { LoadedSupabaseMigration, LoadedSupabaseRepeatable } from "./assets";
import {
    advisoryLock,
    assertAdoptableInstance,
    assertCurrentMigrationFence,
    assertCurrentInstance,
    assertFreshInstanceCompatible,
    assertLedgerEntryCompatible,
    assertRegisteredMigrationFence,
    insertLedger,
    ledgerDdl,
    migrationIdentity,
    runtimeSchemaAdvisoryLock,
    updateConnectorRevision,
    upsertConnectorInstance,
    type SupabaseMigrationExecution,
} from "./ledger";
import { guardedMigration, guardedRepeatable } from "./migrationSql";
import { unwrapTransaction } from "./sqlFormat";

export function buildSupabaseFreshInstallSql(input: {
    integrationKind: string;
    version: string;
    provider: string;
    migration: IntegrationConnectorMigrationDeployment;
    schemas: LoadedSupabaseSqlSchema[];
    attemptId: string;
    packageDigest: string;
}): string {
    const identity = migrationIdentity(input.integrationKind, input.migration);
    const installProvenance = {
        targetPackageDigest: input.packageDigest,
        operationId: `fresh-install:${input.attemptId}`,
        attemptId: input.attemptId,
    };
    return [
        "BEGIN;",
        runtimeSchemaAdvisoryLock(),
        ledgerDdl(),
        advisoryLock(identity),
        assertAdoptableInstance(input.integrationKind, input.provider, input.migration),
        assertFreshInstanceCompatible(
            input.integrationKind,
            input.version,
            input.provider,
            input.migration,
            input.packageDigest,
        ),
        ...input.migration.plan.install.coveredMigrations.map((entry) =>
            assertLedgerEntryCompatible(input.integrationKind, input.migration, entry),
        ),
        ...input.schemas.map((schema) => unwrapTransaction(schema.sql)),
        ...input.migration.plan.install.coveredMigrations.map((entry) =>
            insertLedger(
                input.integrationKind,
                input.provider,
                input.migration,
                entry,
                input.attemptId,
                installProvenance,
            ),
        ),
        upsertConnectorInstance(
            input.integrationKind,
            input.version,
            input.provider,
            input.migration,
            input.migration.plan.install.digest,
            input.packageDigest,
        ),
        "COMMIT;",
    ].join("\n");
}

export type { SupabaseMigrationExecution } from "./ledger";

type SupabaseMigrationAttempt =
    | { attemptId: string; execution?: never }
    | { attemptId?: never; execution: SupabaseMigrationExecution };

export function buildSupabaseMigrationRuntimeSchemaSql(): string {
    return ["BEGIN;", runtimeSchemaAdvisoryLock(), ledgerDdl(), "COMMIT;"].join("\n");
}

export function buildSupabaseMigrationFenceRegistrationSql(input: {
    integrationKind: string;
    migration: IntegrationConnectorMigrationDeployment;
    execution: SupabaseMigrationExecution;
}): string {
    return [
        "BEGIN;",
        assertRegisteredMigrationFence(input.integrationKind, input.migration, input.execution),
        "COMMIT;",
    ].join("\n");
}

export function buildSupabaseMigrationPhaseSql(
    input: {
        integrationKind: string;
        version: string;
        provider: string;
        migration: IntegrationConnectorMigrationDeployment;
        migrations: LoadedSupabaseMigration[];
        repeatables: LoadedSupabaseRepeatable[];
        finalizeTargetPackageDigest?: boolean;
    } & SupabaseMigrationAttempt,
): string {
    const identity = migrationIdentity(input.integrationKind, input.migration);
    const targetRevision = input.migrations.at(-1)?.toRevision ?? input.migration.migrationRevision;
    const execution = input.execution;
    const attemptId = execution?.attemptId ?? input.attemptId;
    if (!attemptId) {
        throw new Error("Supabase migration attemptId is required");
    }
    if (input.finalizeTargetPackageDigest && !execution) {
        throw new Error("Supabase migration package finalization requires fenced execution provenance");
    }
    const updateInstance =
        input.migrations.length || input.finalizeTargetPackageDigest
            ? updateConnectorRevision(
                  input.integrationKind,
                  input.version,
                  input.migration,
                  targetRevision,
                  input.finalizeTargetPackageDigest ? execution?.targetPackageDigest : undefined,
              )
            : "";
    return [
        "BEGIN;",
        execution ? "" : runtimeSchemaAdvisoryLock(),
        execution ? "" : ledgerDdl(),
        advisoryLock(identity),
        execution ? assertCurrentMigrationFence(input.integrationKind, input.migration, execution) : "",
        assertCurrentInstance(input.integrationKind, input.provider, input.migration, targetRevision),
        ...input.migrations.map((migration) =>
            guardedMigration(input.integrationKind, input.provider, input.migration, migration, attemptId, execution),
        ),
        ...input.repeatables.map((repeatable) =>
            guardedRepeatable(input.integrationKind, input.migration, repeatable, attemptId, execution),
        ),
        updateInstance,
        execution ? assertCurrentMigrationFence(input.integrationKind, input.migration, execution) : "",
        "COMMIT;",
    ]
        .filter(Boolean)
        .join("\n");
}
