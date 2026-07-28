import type { IntegrationConnectorMigrationDeployment } from "../../../interfaces/IntegrationConnectorDeployer";
import type { LoadedSupabaseMigration, LoadedSupabaseRepeatable } from "./assets";
import { assertMigrationExecution, insertLedger, RUNTIME_SCHEMA, type SupabaseMigrationExecution } from "./ledger";
import { indent, literal, unwrapTransaction } from "./sqlFormat";

export function guardedMigration(
    integrationKind: string,
    provider: string,
    identity: IntegrationConnectorMigrationDeployment,
    migration: LoadedSupabaseMigration,
    attemptId: string,
    execution?: SupabaseMigrationExecution,
): string {
    const guardedSql = dynamicSql("migration", migration.checksum, migration.sql);
    return `DO ${guardedSql.blockTag}
DECLARE recorded_checksum text;
        current_revision bigint;
BEGIN
    SELECT checksum INTO recorded_checksum
      FROM ${RUNTIME_SCHEMA}.migration_ledger
     WHERE connector_instance_id = ${literal(identity.connectorInstanceId)}
       AND integration_kind = ${literal(integrationKind)}
       AND connector_key = ${literal(identity.connectorKey)}
       AND lineage_id = ${literal(identity.lineageId)}
       AND migration_id = ${literal(migration.id)};
    SELECT migration_revision INTO current_revision
      FROM ${RUNTIME_SCHEMA}.connector_instances
     WHERE connector_instance_id = ${literal(identity.connectorInstanceId)}
       AND integration_kind = ${literal(integrationKind)}
       AND connector_key = ${literal(identity.connectorKey)}
       AND lineage_id = ${literal(identity.lineageId)};
    IF recorded_checksum IS NOT NULL AND recorded_checksum <> ${literal(migration.checksum)} THEN
        RAISE EXCEPTION 'cms integration migration checksum conflict';
    ELSIF recorded_checksum IS NULL AND current_revision >= ${migration.toRevision} THEN
        RAISE EXCEPTION 'cms integration migration ledger is incomplete for current revision';
    ELSIF recorded_checksum IS NULL THEN
${indent(guardedSql.execute, 8)}
${indent(insertLedger(integrationKind, provider, identity, migrationReference(migration), attemptId, execution), 8)}
    END IF;
END
${guardedSql.blockTag};`;
}

export function guardedRepeatable(
    integrationKind: string,
    identity: IntegrationConnectorMigrationDeployment,
    repeatable: LoadedSupabaseRepeatable,
    attemptId: string,
    execution?: SupabaseMigrationExecution,
): string {
    if (execution) {
        assertMigrationExecution(execution);
    }
    const provenanceColumns = execution
        ? ", source_package_digest, target_package_digest, operation_id, fencing_token"
        : "";
    const provenanceValues = execution
        ? `, ${literal(execution.sourcePackageDigest)}, ${literal(execution.targetPackageDigest)}, ${literal(execution.operationId)}, ${execution.fencingToken}`
        : "";
    const provenanceUpdate = execution
        ? ", source_package_digest = EXCLUDED.source_package_digest, target_package_digest = EXCLUDED.target_package_digest, operation_id = EXCLUDED.operation_id, fencing_token = EXCLUDED.fencing_token"
        : "";
    const guardedSql = dynamicSql("repeatable", repeatable.checksum, repeatable.sql);
    return `DO ${guardedSql.blockTag}
DECLARE recorded_checksum text;
BEGIN
    SELECT checksum INTO recorded_checksum
      FROM ${RUNTIME_SCHEMA}.repeatable_ledger
     WHERE connector_instance_id = ${literal(identity.connectorInstanceId)}
       AND integration_kind = ${literal(integrationKind)}
       AND connector_key = ${literal(identity.connectorKey)}
       AND lineage_id = ${literal(identity.lineageId)}
       AND repeatable_id = ${literal(repeatable.id)};
    IF recorded_checksum IS DISTINCT FROM ${literal(repeatable.checksum)} THEN
${indent(guardedSql.execute, 8)}
        INSERT INTO ${RUNTIME_SCHEMA}.repeatable_ledger
            (connector_instance_id, integration_kind, connector_key, lineage_id, repeatable_id, checksum, attempt_id${provenanceColumns})
        VALUES (${literal(identity.connectorInstanceId)}, ${literal(integrationKind)}, ${literal(identity.connectorKey)},
                ${literal(identity.lineageId)}, ${literal(repeatable.id)}, ${literal(repeatable.checksum)}, ${literal(attemptId)}${provenanceValues})
        ON CONFLICT (connector_instance_id, integration_kind, connector_key, lineage_id, repeatable_id)
        DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = statement_timestamp(), attempt_id = EXCLUDED.attempt_id${provenanceUpdate};
    END IF;
END
${guardedSql.blockTag};`;
}

function migrationReference(migration: LoadedSupabaseMigration) {
    return {
        id: migration.id,
        checksum: migration.checksum,
        revision: migration.toRevision,
        introducedIn: migration.introducedIn,
    };
}

function dynamicSql(
    kind: "migration" | "repeatable",
    checksum: string,
    sql: string,
): Readonly<{ blockTag: string; execute: string }> {
    if (!/^sha256:[a-f0-9]{64}$/.test(checksum)) {
        throw new Error(`Supabase ${kind} checksum must be a lowercase SHA-256 digest`);
    }
    const suffix = checksum.slice(-16);
    const blockTag = `$cms_${kind}_${suffix}$`;
    const sqlTag = `$cms_${kind}_sql_${suffix}$`;
    const body = unwrapTransaction(sql);
    if (body.includes(blockTag) || body.includes(sqlTag)) {
        throw new Error(`Supabase ${kind} SQL conflicts with its deterministic delimiter`);
    }
    return {
        blockTag,
        execute: `EXECUTE ${sqlTag}\n${body}\n${sqlTag};`,
    };
}
