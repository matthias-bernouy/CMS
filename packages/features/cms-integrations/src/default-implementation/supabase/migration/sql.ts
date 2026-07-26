import type { IntegrationConnectorMigrationDeployment } from "../../../interfaces/IntegrationConnectorDeployer";
import type { LoadedSupabaseSqlSchema } from "../sql/schemaLoader";
import type { LoadedSupabaseMigration, LoadedSupabaseRepeatable } from "./assets";
import {
    advisoryLock,
    assertAdoptableInstance,
    assertCurrentInstance,
    assertFreshInstanceCompatible,
    assertLedgerEntryCompatible,
    insertLedger,
    ledgerDdl,
    migrationIdentity,
    updateConnectorRevision,
    upsertConnectorInstance,
} from "./ledgerSql";
import { guardedMigration, guardedRepeatable } from "./migrationSql";
import { unwrapTransaction } from "./sqlFormat";

export function buildSupabaseFreshInstallSql(input: {
    integrationKind: string;
    version: string;
    provider: string;
    migration: IntegrationConnectorMigrationDeployment;
    schemas: LoadedSupabaseSqlSchema[];
    attemptId: string;
}): string {
    const identity = migrationIdentity(input.integrationKind, input.migration);
    return [
        "BEGIN;",
        ledgerDdl(),
        advisoryLock(identity),
        assertAdoptableInstance(input.integrationKind, input.provider, input.migration),
        assertFreshInstanceCompatible(input.integrationKind, input.version, input.provider, input.migration),
        ...input.migration.plan.install.coveredMigrations.map((entry) =>
            assertLedgerEntryCompatible(input.integrationKind, input.migration, entry),
        ),
        ...input.schemas.map((schema) => unwrapTransaction(schema.sql)),
        ...input.migration.plan.install.coveredMigrations.map((entry) =>
            insertLedger(input.integrationKind, input.provider, input.migration, entry, input.attemptId),
        ),
        upsertConnectorInstance(
            input.integrationKind,
            input.version,
            input.provider,
            input.migration,
            input.migration.plan.install.digest,
        ),
        "COMMIT;",
    ].join("\n");
}

export function buildSupabaseMigrationPhaseSql(input: {
    integrationKind: string;
    version: string;
    provider: string;
    migration: IntegrationConnectorMigrationDeployment;
    migrations: LoadedSupabaseMigration[];
    repeatables: LoadedSupabaseRepeatable[];
    attemptId: string;
}): string {
    const identity = migrationIdentity(input.integrationKind, input.migration);
    const targetRevision = input.migrations.at(-1)?.toRevision ?? input.migration.migrationRevision;
    return [
        "BEGIN;",
        ledgerDdl(),
        advisoryLock(identity),
        assertCurrentInstance(input.integrationKind, input.provider, input.migration, targetRevision),
        ...input.migrations.map((migration) =>
            guardedMigration(input.integrationKind, input.provider, input.migration, migration, input.attemptId),
        ),
        ...input.repeatables.map((repeatable) =>
            guardedRepeatable(input.integrationKind, input.migration, repeatable, input.attemptId),
        ),
        input.migrations.length
            ? updateConnectorRevision(
                  input.integrationKind,
                  input.version,
                  input.migration,
                  input.migrations.at(-1)!.toRevision,
              )
            : "",
        "COMMIT;",
    ]
        .filter(Boolean)
        .join("\n");
}
