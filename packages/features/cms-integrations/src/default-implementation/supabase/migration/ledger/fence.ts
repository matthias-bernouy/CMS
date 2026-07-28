import type { IntegrationConnectorMigrationDeployment } from "../../../../interfaces/IntegrationConnectorDeployer";
import { literal } from "../sqlFormat";
import { RUNTIME_SCHEMA } from "./schema";

export type SupabaseMigrationLedgerProvenance = Readonly<{
    sourcePackageDigest?: string;
    targetPackageDigest?: string;
    operationId?: string;
    attemptId: string;
    fencingToken?: number;
}>;

export type SupabaseMigrationExecution = SupabaseMigrationLedgerProvenance &
    Readonly<{
        sourcePackageDigest: string;
        targetPackageDigest: string;
        operationId: string;
        fencingToken: number;
    }>;

export function assertRegisteredMigrationFence(
    integrationKind: string,
    identity: IntegrationConnectorMigrationDeployment,
    execution: SupabaseMigrationExecution,
): string {
    return [
        assertMigrationFenceSource(integrationKind, identity, execution),
        registerMigrationFence(integrationKind, identity, execution),
        assertCurrentMigrationFence(integrationKind, identity, execution),
    ].join("\n");
}

export function assertCurrentMigrationFence(
    integrationKind: string,
    identity: IntegrationConnectorMigrationDeployment,
    execution: SupabaseMigrationExecution,
): string {
    assertMigrationExecution(execution);
    return assertionBlock(
        `NOT EXISTS (SELECT 1 FROM ${RUNTIME_SCHEMA}.migration_fences
          WHERE connector_instance_id = ${literal(identity.connectorInstanceId)}
            AND integration_kind = ${literal(integrationKind)}
            AND connector_key = ${literal(identity.connectorKey)}
            AND lineage_id = ${literal(identity.lineageId)}
            AND source_package_digest = ${literal(execution.sourcePackageDigest)}
            AND target_package_digest = ${literal(execution.targetPackageDigest)}
            AND operation_id = ${literal(execution.operationId)}
            AND attempt_id = ${literal(execution.attemptId)}
            AND fencing_token = ${execution.fencingToken})`,
        "cms integration migration attempt was fenced",
    );
}

export function assertMigrationExecution(execution: SupabaseMigrationExecution): void {
    assertMigrationLedgerProvenance(execution);
    if (!execution.sourcePackageDigest || !/^[a-f0-9]{64}$/.test(execution.sourcePackageDigest)) {
        throw new Error("Supabase migration sourcePackageDigest must be a lowercase SHA-256 digest");
    }
}

export function assertMigrationLedgerProvenance(provenance: SupabaseMigrationLedgerProvenance): void {
    if (provenance.sourcePackageDigest !== undefined && !/^[a-f0-9]{64}$/.test(provenance.sourcePackageDigest)) {
        throw new Error("Supabase migration sourcePackageDigest must be a lowercase SHA-256 digest");
    }
    if (provenance.targetPackageDigest !== undefined && !/^[a-f0-9]{64}$/.test(provenance.targetPackageDigest)) {
        throw new Error("Supabase migration targetPackageDigest must be a lowercase SHA-256 digest");
    }
    if (provenance.operationId !== undefined && !provenance.operationId.trim()) {
        throw new Error("Supabase migration operationId is required");
    }
    if (!provenance.attemptId.trim()) {
        throw new Error("Supabase migration attemptId is required");
    }
    if (
        provenance.fencingToken !== undefined &&
        (!Number.isSafeInteger(provenance.fencingToken) || provenance.fencingToken < 1)
    ) {
        throw new Error("Supabase migration fencingToken must be a positive safe integer");
    }
    if ((provenance.targetPackageDigest === undefined) !== (provenance.operationId === undefined)) {
        throw new Error("Supabase migration target package and operation provenance must be declared together");
    }
    if (
        provenance.fencingToken !== undefined &&
        (provenance.targetPackageDigest === undefined || provenance.operationId === undefined)
    ) {
        throw new Error("Supabase migration fenced provenance must include target package and operation identity");
    }
}

function registerMigrationFence(
    integrationKind: string,
    identity: IntegrationConnectorMigrationDeployment,
    execution: SupabaseMigrationExecution,
): string {
    assertMigrationExecution(execution);
    return `INSERT INTO ${RUNTIME_SCHEMA}.migration_fences
    (connector_instance_id, integration_kind, connector_key, lineage_id, source_package_digest,
     target_package_digest, operation_id, attempt_id, fencing_token)
VALUES (${literal(identity.connectorInstanceId)}, ${literal(integrationKind)}, ${literal(identity.connectorKey)},
        ${literal(identity.lineageId)}, ${literal(execution.sourcePackageDigest)},
        ${literal(execution.targetPackageDigest)}, ${literal(execution.operationId)},
        ${literal(execution.attemptId)}, ${execution.fencingToken})
ON CONFLICT (connector_instance_id, integration_kind, connector_key, lineage_id)
DO UPDATE SET source_package_digest = EXCLUDED.source_package_digest,
              target_package_digest = EXCLUDED.target_package_digest,
              operation_id = EXCLUDED.operation_id,
              attempt_id = EXCLUDED.attempt_id,
              fencing_token = EXCLUDED.fencing_token,
              registered_at = statement_timestamp()
WHERE
    (${RUNTIME_SCHEMA}.migration_fences.operation_id = EXCLUDED.operation_id
     AND ${RUNTIME_SCHEMA}.migration_fences.source_package_digest = EXCLUDED.source_package_digest
     AND ${RUNTIME_SCHEMA}.migration_fences.target_package_digest = EXCLUDED.target_package_digest
     AND (${RUNTIME_SCHEMA}.migration_fences.fencing_token < EXCLUDED.fencing_token
          OR (${RUNTIME_SCHEMA}.migration_fences.fencing_token = EXCLUDED.fencing_token
              AND ${RUNTIME_SCHEMA}.migration_fences.attempt_id = EXCLUDED.attempt_id)))
    OR
    (${RUNTIME_SCHEMA}.migration_fences.operation_id <> EXCLUDED.operation_id
     AND ${RUNTIME_SCHEMA}.migration_fences.target_package_digest = EXCLUDED.source_package_digest);`;
}

function assertMigrationFenceSource(
    integrationKind: string,
    identity: IntegrationConnectorMigrationDeployment,
    execution: SupabaseMigrationExecution,
): string {
    assertMigrationExecution(execution);
    return assertionBlock(
        `NOT EXISTS (SELECT 1 FROM ${RUNTIME_SCHEMA}.connector_instances
          WHERE connector_instance_id = ${literal(identity.connectorInstanceId)}
            AND integration_kind = ${literal(integrationKind)}
            AND connector_key = ${literal(identity.connectorKey)}
            AND lineage_id = ${literal(identity.lineageId)})
         OR EXISTS (SELECT 1 FROM ${RUNTIME_SCHEMA}.connector_instances
          WHERE connector_instance_id = ${literal(identity.connectorInstanceId)}
            AND integration_kind = ${literal(integrationKind)}
            AND connector_key = ${literal(identity.connectorKey)}
            AND lineage_id = ${literal(identity.lineageId)}
            AND package_digest IS DISTINCT FROM ${literal(execution.sourcePackageDigest)}
            AND package_digest IS DISTINCT FROM ${literal(execution.targetPackageDigest)})`,
        "cms integration migration source package digest conflict",
    );
}

function assertionBlock(condition: string, message: string): string {
    return `DO $cms_assert$ BEGIN IF ${condition} THEN RAISE EXCEPTION ${literal(message)}; END IF; END $cms_assert$;`;
}
