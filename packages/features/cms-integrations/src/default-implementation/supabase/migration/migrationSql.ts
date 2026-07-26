import type { IntegrationConnectorMigrationDeployment } from "../../../interfaces/IntegrationConnectorDeployer";
import type { LoadedSupabaseMigration, LoadedSupabaseRepeatable } from "./assets";
import { insertLedger, RUNTIME_SCHEMA } from "./ledgerSql";
import { indent, literal, unwrapTransaction } from "./sqlFormat";

export function guardedMigration(
    integrationKind: string,
    provider: string,
    identity: IntegrationConnectorMigrationDeployment,
    migration: LoadedSupabaseMigration,
    attemptId: string,
): string {
    const tag = `$cms_migration_${migration.checksum.slice(-16)}$`;
    return `DO ${tag}
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
${indentMigrationSql(migration.sql)}
${indent(insertLedger(integrationKind, provider, identity, migrationReference(migration), attemptId), 8)}
    END IF;
END
${tag};`;
}

export function guardedRepeatable(
    integrationKind: string,
    identity: IntegrationConnectorMigrationDeployment,
    repeatable: LoadedSupabaseRepeatable,
    attemptId: string,
): string {
    const tag = `$cms_repeatable_${repeatable.checksum.slice(-16)}$`;
    return `DO ${tag}
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
${indentMigrationSql(repeatable.sql)}
        INSERT INTO ${RUNTIME_SCHEMA}.repeatable_ledger
            (connector_instance_id, integration_kind, connector_key, lineage_id, repeatable_id, checksum, attempt_id)
        VALUES (${literal(identity.connectorInstanceId)}, ${literal(integrationKind)}, ${literal(identity.connectorKey)},
                ${literal(identity.lineageId)}, ${literal(repeatable.id)}, ${literal(repeatable.checksum)}, ${literal(attemptId)})
        ON CONFLICT (connector_instance_id, integration_kind, connector_key, lineage_id, repeatable_id)
        DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = statement_timestamp(), attempt_id = EXCLUDED.attempt_id;
    END IF;
END
${tag};`;
}

function migrationReference(migration: LoadedSupabaseMigration) {
    return {
        id: migration.id,
        checksum: migration.checksum,
        revision: migration.toRevision,
        introducedIn: migration.introducedIn,
    };
}

function indentMigrationSql(sql: string): string {
    return indent(unwrapTransaction(sql), 8);
}
