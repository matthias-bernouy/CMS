import { join } from "node:path";
import {
    buildSupabaseMigrationFenceRegistrationSql,
    buildSupabaseMigrationPhaseSql,
    buildSupabaseMigrationRuntimeSchemaSql,
    loadSupabaseMigrationAssets,
    loadSupabaseRepeatableAssets,
    type SupabaseMigrationExecution,
} from "@bernouy/cms-integrations/supabase";
import type { LoadedMigrationPackage, TargetMigrationConnector } from "../types";
import type { ExecuteMigrationMatrixInput } from "./index";

type ProbePhaseInput = ExecuteMigrationMatrixInput & {
    target: LoadedMigrationPackage;
    connector: TargetMigrationConnector;
};

export async function buildFirstMigrationPhaseSql(input: ProbePhaseInput): Promise<string> {
    const descriptor = pendingMigration(input);
    const root = join(input.target.root, input.connector.connector.root ?? ".");
    const migrations = descriptor ? await loadSupabaseMigrationAssets(root, [descriptor]) : [];
    const repeatables =
        !descriptor || descriptor.phase === "expand"
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
        finalizeTargetPackageDigest: descriptor?.phase === "contract",
    });
}

export function pendingMigration(input: ProbePhaseInput) {
    return input.connector.plan.migrations.find((entry) => entry.toRevision > input.migration.sourceMigrationRevision);
}

function migrationExecution(input: ProbePhaseInput): SupabaseMigrationExecution {
    return {
        sourcePackageDigest: input.migration.source.packageDigest,
        targetPackageDigest: input.migration.target.packageDigest,
        operationId: `verification-${input.attempt.jobId}`,
        attemptId: input.attempt.attemptId,
        fencingToken: input.attempt.fencingToken,
    };
}
