import type { SQL } from "bun";
import { buildSupabaseFreshInstallSql, computeSupabaseInstallDigest } from "@bernouy/cms-integrations/supabase";
import type { MigrationVerificationInputV1 } from "@bernouy/cms-integration-verification";
import { loadConnectorSchemas, requireSourceConnector } from "../packages";
import { readMigrationLedger, targetInstanceIsExact } from "../state";
import type { LoadedMigrationPackage, TargetMigrationConnector } from "../types";
import { adoptLegacySource, connectorInstanceId, requireLegacyAdoption } from "./legacy";
import { migrationDeployment } from "./target";

export async function installFreshTarget(
    database: SQL,
    target: LoadedMigrationPackage,
    selected: TargetMigrationConnector,
    input: MigrationVerificationInputV1,
): Promise<boolean> {
    const schemas = await loadConnectorSchemas(target, selected.connector);
    await assertInstallDigest(schemas, selected.plan.install.digest, input.connectorKey, "target");
    await database.unsafe(
        buildSupabaseFreshInstallSql({
            integrationKind: input.target.kind,
            version: input.target.version,
            provider: "supabase",
            migration: migrationDeployment(selected, input.targetMigrationRevision),
            schemas,
            attemptId: "verification-fresh-install",
            packageDigest: input.target.packageDigest,
        }),
    );
    const rows = await readMigrationLedger(database, input);
    return (
        (await targetInstanceIsExact(database, input)) &&
        rows.length === selected.plan.install.coveredMigrations.length &&
        rows.every((row, index) => {
            const expected = selected.plan.install.coveredMigrations[index];
            return (
                row.migrationId === expected?.id &&
                row.checksum === expected.checksum &&
                row.revision === expected.revision &&
                row.targetPackageDigest === input.target.packageDigest &&
                row.sourcePackageDigest === undefined
            );
        })
    );
}

export async function installMigrationSource(
    database: SQL,
    source: LoadedMigrationPackage,
    selected: TargetMigrationConnector,
    input: MigrationVerificationInputV1,
    attemptId: string,
): Promise<void> {
    const connector = requireSourceConnector(source, selected, input);
    const schemas = await loadConnectorSchemas(source, connector);
    const sourcePlan =
        connector.connectorKey === input.connectorKey &&
        connector.lineageId === input.lineageId &&
        connector.migrationRevision === input.sourceMigrationRevision
            ? connector.migration
            : undefined;
    if (sourcePlan) {
        await assertInstallDigest(schemas, sourcePlan.install.digest, input.connectorKey, "source");
        await database.unsafe(
            buildSupabaseFreshInstallSql({
                integrationKind: input.source.kind,
                version: input.source.version,
                provider: "supabase",
                migration: {
                    connectorKey: input.connectorKey,
                    lineageId: input.lineageId,
                    connectorInstanceId: connectorInstanceId(input),
                    migrationRevision: input.sourceMigrationRevision,
                    plan: sourcePlan,
                },
                schemas,
                attemptId: `source-${attemptId}`,
                packageDigest: input.source.packageDigest,
            }),
        );
        return;
    }
    const baseline = requireLegacyAdoption(selected, input);
    await assertInstallDigest(schemas, baseline.installDigest, input.connectorKey, "legacy source");
    for (const schema of schemas) {
        await database.unsafe(schema.sql);
    }
    await adoptLegacySource(database, baseline, input, attemptId);
}

async function assertInstallDigest(
    schemas: Parameters<typeof computeSupabaseInstallDigest>[0],
    expected: string,
    connectorKey: string,
    release: string,
): Promise<void> {
    const actual = await computeSupabaseInstallDigest(schemas);
    if (actual !== expected) {
        throw new Error(
            `Supabase ${release} install baseline digest mismatch for connector "${connectorKey}": expected ${expected}, received ${actual}`,
        );
    }
}
