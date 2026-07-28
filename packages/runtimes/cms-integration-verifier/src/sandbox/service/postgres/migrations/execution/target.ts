import type { SQL } from "bun";
import { join } from "node:path";
import type { IntegrationConnectorMigrationDeployment } from "@bernouy/cms-integrations";
import {
    buildSupabaseMigrationFenceRegistrationSql,
    buildSupabaseMigrationPhaseSql,
    buildSupabaseMigrationRuntimeSchemaSql,
    loadSupabaseMigrationAssets,
    loadSupabaseRepeatableAssets,
    type SupabaseMigrationExecution,
} from "@bernouy/cms-integrations/supabase";
import type { MigrationVerificationInputV1 } from "@bernouy/cms-integration-verification";
import type { LoadedMigrationPackage, TargetMigrationConnector } from "../types";

export async function applyTargetMigration(
    database: SQL,
    target: LoadedMigrationPackage,
    selected: TargetMigrationConnector,
    input: MigrationVerificationInputV1,
    attempt: Readonly<{ attemptId: string; fencingToken: number; jobId: string }>,
): Promise<void> {
    const root = join(target.root, selected.connector.root ?? ".");
    const migrations = await loadSupabaseMigrationAssets(root, selected.plan.migrations);
    const repeatables = await loadSupabaseRepeatableAssets(root, selected.plan.repeatables ?? []);
    const execution: SupabaseMigrationExecution = {
        sourcePackageDigest: input.source.packageDigest,
        targetPackageDigest: input.target.packageDigest,
        operationId: `verification-${attempt.jobId}`,
        attemptId: attempt.attemptId,
        fencingToken: attempt.fencingToken,
    };
    await database.unsafe(buildSupabaseMigrationRuntimeSchemaSql());
    await database.unsafe(
        buildSupabaseMigrationFenceRegistrationSql({
            integrationKind: input.target.kind,
            migration: migrationDeployment(selected, input.sourceMigrationRevision),
            execution,
        }),
    );
    let revision = input.sourceMigrationRevision;
    for (const phase of ["expand", "contract"] as const) {
        const selectedMigrations = migrations.filter(
            (entry) => entry.phase === phase && entry.toRevision > input.sourceMigrationRevision,
        );
        await database.unsafe(
            buildSupabaseMigrationPhaseSql({
                integrationKind: input.target.kind,
                version: input.target.version,
                provider: "supabase",
                migration: migrationDeployment(selected, revision),
                migrations: selectedMigrations,
                repeatables: phase === "expand" ? repeatables : [],
                execution,
                finalizeTargetPackageDigest: phase === "contract",
            }),
        );
        revision = selectedMigrations.at(-1)?.toRevision ?? revision;
    }
}

export function migrationDeployment(
    selected: TargetMigrationConnector,
    migrationRevision: number,
): IntegrationConnectorMigrationDeployment {
    return {
        connectorKey: selected.connector.connectorKey,
        lineageId: selected.connector.lineageId,
        connectorInstanceId: `verification-${selected.connector.connectorKey}`,
        migrationRevision,
        plan: selected.plan,
    };
}
