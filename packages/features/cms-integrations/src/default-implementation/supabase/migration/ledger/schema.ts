import { literal } from "../sqlFormat";

export const RUNTIME_SCHEMA = "cms_integration_runtime";

export function ledgerDdl(): string {
    return `
CREATE SCHEMA IF NOT EXISTS ${RUNTIME_SCHEMA};
CREATE TABLE IF NOT EXISTS ${RUNTIME_SCHEMA}.connector_instances (
    connector_instance_id text NOT NULL,
    integration_kind text NOT NULL,
    connector_key text NOT NULL,
    lineage_id text NOT NULL,
    provider text NOT NULL,
    migration_revision bigint NOT NULL CHECK (migration_revision >= 0),
    baseline_digest text NOT NULL,
    package_version text NOT NULL,
    package_digest text,
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    PRIMARY KEY (connector_instance_id, integration_kind, connector_key, lineage_id)
);
CREATE TABLE IF NOT EXISTS ${RUNTIME_SCHEMA}.migration_ledger (
    connector_instance_id text NOT NULL,
    integration_kind text NOT NULL,
    connector_key text NOT NULL,
    lineage_id text NOT NULL,
    migration_id text NOT NULL,
    provider text NOT NULL,
    checksum text NOT NULL,
    migration_revision bigint NOT NULL,
    introduced_in text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    attempt_id text NOT NULL,
    source_package_digest text,
    target_package_digest text,
    operation_id text,
    fencing_token bigint,
    PRIMARY KEY (connector_instance_id, integration_kind, connector_key, lineage_id, migration_id)
);
CREATE TABLE IF NOT EXISTS ${RUNTIME_SCHEMA}.repeatable_ledger (
    connector_instance_id text NOT NULL,
    integration_kind text NOT NULL,
    connector_key text NOT NULL,
    lineage_id text NOT NULL,
    repeatable_id text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    attempt_id text NOT NULL,
    source_package_digest text,
    target_package_digest text,
    operation_id text,
    fencing_token bigint,
    PRIMARY KEY (connector_instance_id, integration_kind, connector_key, lineage_id, repeatable_id)
);
CREATE TABLE IF NOT EXISTS ${RUNTIME_SCHEMA}.migration_fences (
    connector_instance_id text NOT NULL,
    integration_kind text NOT NULL,
    connector_key text NOT NULL,
    lineage_id text NOT NULL,
    source_package_digest text NOT NULL CHECK (source_package_digest ~ '^[a-f0-9]{64}$'),
    target_package_digest text NOT NULL CHECK (target_package_digest ~ '^[a-f0-9]{64}$'),
    operation_id text NOT NULL,
    attempt_id text NOT NULL,
    fencing_token bigint NOT NULL CHECK (fencing_token > 0),
    registered_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    PRIMARY KEY (connector_instance_id, integration_kind, connector_key, lineage_id)
);
ALTER TABLE ${RUNTIME_SCHEMA}.connector_instances
    ADD COLUMN IF NOT EXISTS package_digest text;
ALTER TABLE ${RUNTIME_SCHEMA}.migration_ledger
    ADD COLUMN IF NOT EXISTS source_package_digest text,
    ADD COLUMN IF NOT EXISTS target_package_digest text,
    ADD COLUMN IF NOT EXISTS operation_id text,
    ADD COLUMN IF NOT EXISTS fencing_token bigint;
ALTER TABLE ${RUNTIME_SCHEMA}.repeatable_ledger
    ADD COLUMN IF NOT EXISTS source_package_digest text,
    ADD COLUMN IF NOT EXISTS target_package_digest text,
    ADD COLUMN IF NOT EXISTS operation_id text,
    ADD COLUMN IF NOT EXISTS fencing_token bigint;
`;
}

export function migrationRuntimeSchemaReadinessSql(): string {
    return `SELECT NOT EXISTS (
    SELECT required.table_name, required.column_name
      FROM (VALUES
        ('connector_instances', 'package_digest'),
        ('migration_ledger', 'source_package_digest'),
        ('migration_ledger', 'target_package_digest'),
        ('migration_ledger', 'operation_id'),
        ('migration_ledger', 'fencing_token'),
        ('repeatable_ledger', 'source_package_digest'),
        ('repeatable_ledger', 'target_package_digest'),
        ('repeatable_ledger', 'operation_id'),
        ('repeatable_ledger', 'fencing_token'),
        ('migration_fences', 'source_package_digest'),
        ('migration_fences', 'target_package_digest'),
        ('migration_fences', 'operation_id'),
        ('migration_fences', 'attempt_id'),
        ('migration_fences', 'fencing_token')
      ) AS required(table_name, column_name)
     WHERE NOT EXISTS (
        SELECT 1
          FROM information_schema.columns existing
         WHERE existing.table_schema = ${literal(RUNTIME_SCHEMA)}
           AND existing.table_name = required.table_name
           AND existing.column_name = required.column_name
     )
) AS migration_runtime_schema_ready;`;
}
