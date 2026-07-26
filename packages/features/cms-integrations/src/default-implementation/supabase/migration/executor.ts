import { IntegrationRuntimeError } from "../../../core/errors";
import type {
    IntegrationConnectorMigrationAdapter,
    IntegrationConnectorMigrationDeployment,
    IntegrationMigrationConnectorTransition,
    IntegrationMigrationStepContext,
} from "../../../interfaces/IntegrationConnectorDeployer";
import { resolveExistingSupabaseDirectory } from "../paths";
import { SupabaseManagementClient } from "../SupabaseManagementClient";
import type { SupabaseConnectorDeployerConfig } from "../types";
import { loadSupabaseMigrationAssets, loadSupabaseRepeatableAssets } from "./assets";
import { migrationRuntimeSchemaReadinessSql, type SupabaseMigrationExecution } from "./ledger";
import {
    buildSupabaseMigrationFenceRegistrationSql,
    buildSupabaseMigrationPhaseSql,
    buildSupabaseMigrationRuntimeSchemaSql,
} from "./sql";

export class SupabaseConnectorMigrationAdapter implements IntegrationConnectorMigrationAdapter {
    readonly provider = "supabase";
    private readonly client: SupabaseManagementClient;

    constructor(config: SupabaseConnectorDeployerConfig) {
        const projectRef = required(config.projectRef, "projectRef");
        const accessToken = required(config.accessToken, "accessToken");
        this.client = new SupabaseManagementClient({
            projectRef,
            accessToken,
            apiBaseUrl: (config.apiBaseUrl ?? "https://api.supabase.com").replace(/\/+$/, ""),
            fetch: config.fetch ?? fetch,
        });
    }

    async executeDatabasePhase(
        context: IntegrationMigrationStepContext,
        connector: IntegrationMigrationConnectorTransition,
    ): Promise<{ externalOperationId: string }> {
        if (context.phase !== "expand" && context.phase !== "contract") {
            throw new IntegrationRuntimeError(`Supabase database adapter cannot execute phase "${context.phase}"`);
        }
        const definition = requiredConnectorDefinition(context, connector.connectorKey);
        const connectorRoot = await resolveExistingSupabaseDirectory(context.targetPackageRoot, definition.root ?? "");
        const descriptors = migrationsForPhase(connector, context.phase);
        const migrations = await loadSupabaseMigrationAssets(connectorRoot, descriptors);
        const repeatables =
            context.phase === "expand"
                ? await loadSupabaseRepeatableAssets(connectorRoot, connector.plan.repeatables ?? [])
                : [];
        const execution = migrationExecution(context);
        await this.ensureMigrationRuntimeSchema();
        await this.client.applyMigrationTransaction(
            buildSupabaseMigrationFenceRegistrationSql({
                integrationKind: context.targetDefinition.kind,
                migration: phaseIdentity(connector, context.phase),
                execution,
            }),
        );
        await this.client.applyMigrationTransaction(
            buildSupabaseMigrationPhaseSql({
                integrationKind: context.targetDefinition.kind,
                version: context.operation.targetVersion,
                provider: connector.provider,
                migration: phaseIdentity(connector, context.phase),
                migrations,
                repeatables,
                execution,
                finalizeTargetPackageDigest: context.phase === "contract",
            }),
        );
        return { externalOperationId: context.idempotencyKey };
    }

    async confirmDatabasePhase(
        context: IntegrationMigrationStepContext,
        connector: IntegrationMigrationConnectorTransition,
    ): Promise<boolean> {
        if (context.phase !== "expand" && context.phase !== "contract") {
            return false;
        }
        const migrations = migrationsForPhase(connector, context.phase);
        const rows = await this.client.readDatabaseRows(
            confirmationQuery(
                context.targetDefinition.kind,
                connector,
                phaseTargetRevision(connector, context.phase),
                migrations,
                context.phase === "contract" ? context.operation.targetPackageDigest : undefined,
            ),
        );
        return (
            rows.length === 1 &&
            Number(rows[0]?.migration_revision) === phaseTargetRevision(connector, context.phase) &&
            Number(rows[0]?.matching_migrations) === migrations.length
        );
    }

    private async ensureMigrationRuntimeSchema(): Promise<void> {
        const rows = await this.client.readDatabaseRows(migrationRuntimeSchemaReadinessSql());
        if (rows.length === 1 && rows[0]?.migration_runtime_schema_ready === true) {
            return;
        }
        await this.client.applyMigrationTransaction(buildSupabaseMigrationRuntimeSchemaSql());
    }
}

function migrationExecution(context: IntegrationMigrationStepContext): SupabaseMigrationExecution {
    const sourcePackageDigest = context.operation.currentPackageDigest;
    if (!sourcePackageDigest || !/^[a-f0-9]{64}$/.test(sourcePackageDigest)) {
        throw new IntegrationRuntimeError("Supabase migration requires an exact source package digest");
    }
    return {
        sourcePackageDigest,
        targetPackageDigest: context.operation.targetPackageDigest,
        operationId: context.operation.id,
        attemptId: context.operation.attemptId,
        fencingToken: context.operation.fencingToken,
    };
}

function requiredConnectorDefinition(context: IntegrationMigrationStepContext, connectorKey: string) {
    const connector = context.targetDefinition.connectors?.find((entry) => entry.connectorKey === connectorKey);
    if (!connector?.migration || !connector.lineageId || connector.migrationRevision === undefined) {
        throw new IntegrationRuntimeError(`Target connector "${connectorKey}" migration definition is unavailable`);
    }
    return connector;
}

function migrationsForPhase(connector: IntegrationMigrationConnectorTransition, phase: "expand" | "contract") {
    return connector.plan.migrations
        .filter(
            (migration) =>
                migration.phase === phase &&
                migration.toRevision > connector.fromRevision &&
                migration.toRevision <= connector.toRevision,
        )
        .sort((left, right) => left.toRevision - right.toRevision);
}

function phaseIdentity(
    connector: IntegrationMigrationConnectorTransition,
    phase: "expand" | "contract",
): IntegrationConnectorMigrationDeployment {
    return {
        connectorKey: connector.connectorKey,
        lineageId: connector.lineageId,
        connectorInstanceId: connector.connectorInstanceId,
        migrationRevision: phaseStartRevision(connector, phase),
        plan: connector.plan,
    };
}

function phaseStartRevision(connector: IntegrationMigrationConnectorTransition, phase: "expand" | "contract"): number {
    if (phase === "expand") {
        return connector.fromRevision;
    }
    return phaseTargetRevision(connector, "expand");
}

function phaseTargetRevision(connector: IntegrationMigrationConnectorTransition, phase: "expand" | "contract"): number {
    return migrationsForPhase(connector, phase).reduce(
        (revision, migration) => Math.max(revision, migration.toRevision),
        phaseStartRevisionWithoutRecursion(connector, phase),
    );
}

function phaseStartRevisionWithoutRecursion(
    connector: IntegrationMigrationConnectorTransition,
    phase: "expand" | "contract",
): number {
    if (phase === "expand") {
        return connector.fromRevision;
    }
    return migrationsForPhase(connector, "expand").reduce(
        (revision, migration) => Math.max(revision, migration.toRevision),
        connector.fromRevision,
    );
}

function confirmationQuery(
    integrationKind: string,
    connector: IntegrationMigrationConnectorTransition,
    revision: number,
    migrations: Array<{ id: string; checksum: string }>,
    packageDigest?: string,
): string {
    const checks = migrations.length
        ? migrations.map((migration) => `(${literal(migration.id)}, ${literal(migration.checksum)})`).join(", ")
        : "(NULL::text, NULL::text)";
    return `SELECT instance.migration_revision,
       (SELECT count(*) FROM cms_integration_runtime.migration_ledger ledger
         JOIN (VALUES ${checks}) AS expected(migration_id, checksum)
           ON expected.migration_id = ledger.migration_id AND expected.checksum = ledger.checksum
        WHERE ledger.connector_instance_id = ${literal(connector.connectorInstanceId)}
          AND ledger.integration_kind = ${literal(integrationKind)}
          AND ledger.connector_key = ${literal(connector.connectorKey)}
          AND ledger.lineage_id = ${literal(connector.lineageId)}) AS matching_migrations
FROM cms_integration_runtime.connector_instances instance
WHERE instance.connector_instance_id = ${literal(connector.connectorInstanceId)}
  AND instance.integration_kind = ${literal(integrationKind)}
  AND instance.connector_key = ${literal(connector.connectorKey)}
  AND instance.lineage_id = ${literal(connector.lineageId)}
  AND instance.migration_revision >= ${revision}${
      packageDigest
          ? `
  AND instance.package_digest = ${literal(packageDigest)}`
          : ""
};`;
}

function literal(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}

function required(value: string, name: string): string {
    const parsed = value.trim();
    if (!parsed) {
        throw new IntegrationRuntimeError(`Supabase ${name} is required`);
    }
    return parsed;
}
