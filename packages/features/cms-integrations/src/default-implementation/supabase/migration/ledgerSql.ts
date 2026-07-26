import type { IntegrationConnectorMigrationDeployment } from "../../../interfaces/IntegrationConnectorDeployer";
import { literal } from "./sqlFormat";

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
    PRIMARY KEY (connector_instance_id, integration_kind, connector_key, lineage_id, repeatable_id)
);`;
}

export function assertAdoptableInstance(
    integrationKind: string,
    provider: string,
    identity: IntegrationConnectorMigrationDeployment,
): string {
    return assertionBlock(
        `EXISTS (SELECT 1 FROM ${RUNTIME_SCHEMA}.connector_instances
          WHERE connector_instance_id = ${literal(identity.connectorInstanceId)}
            AND (integration_kind, connector_key, lineage_id, provider) <>
                (${literal(integrationKind)}, ${literal(identity.connectorKey)}, ${literal(identity.lineageId)}, ${literal(provider)}))`,
        "cms integration connector identity conflict",
    );
}

export function assertCurrentInstance(
    integrationKind: string,
    provider: string,
    identity: IntegrationConnectorMigrationDeployment,
    targetRevision: number,
): string {
    return assertionBlock(
        `NOT EXISTS (SELECT 1 FROM ${RUNTIME_SCHEMA}.connector_instances
          WHERE connector_instance_id = ${literal(identity.connectorInstanceId)}
            AND integration_kind = ${literal(integrationKind)}
            AND connector_key = ${literal(identity.connectorKey)}
            AND lineage_id = ${literal(identity.lineageId)}
            AND provider = ${literal(provider)}
            AND (migration_revision = ${identity.migrationRevision} OR migration_revision >= ${targetRevision}))`,
        "cms integration connector revision mismatch",
    );
}

export function assertFreshInstanceCompatible(
    integrationKind: string,
    version: string,
    provider: string,
    identity: IntegrationConnectorMigrationDeployment,
): string {
    return assertionBlock(
        `EXISTS (SELECT 1 FROM ${RUNTIME_SCHEMA}.connector_instances
          WHERE connector_instance_id = ${literal(identity.connectorInstanceId)}
            AND integration_kind = ${literal(integrationKind)}
            AND connector_key = ${literal(identity.connectorKey)}
            AND lineage_id = ${literal(identity.lineageId)}
            AND (provider, migration_revision, baseline_digest, package_version) <>
                (${literal(provider)}, ${identity.migrationRevision}, ${literal(identity.plan.install.digest)}, ${literal(version)}))`,
        "cms integration fresh baseline conflict",
    );
}

export function assertLedgerEntryCompatible(
    integrationKind: string,
    identity: IntegrationConnectorMigrationDeployment,
    migration: { id: string; checksum: string },
): string {
    return assertionBlock(
        `EXISTS (SELECT 1 FROM ${RUNTIME_SCHEMA}.migration_ledger
          WHERE connector_instance_id = ${literal(identity.connectorInstanceId)}
            AND integration_kind = ${literal(integrationKind)}
            AND connector_key = ${literal(identity.connectorKey)}
            AND lineage_id = ${literal(identity.lineageId)}
            AND migration_id = ${literal(migration.id)}
            AND checksum <> ${literal(migration.checksum)})`,
        "cms integration migration checksum conflict",
    );
}

export function insertLedger(
    integrationKind: string,
    provider: string,
    identity: IntegrationConnectorMigrationDeployment,
    migration: { id: string; checksum: string; revision: number; introducedIn: string },
    attemptId: string,
): string {
    return `INSERT INTO ${RUNTIME_SCHEMA}.migration_ledger
    (connector_instance_id, integration_kind, connector_key, lineage_id, migration_id, provider,
     checksum, migration_revision, introduced_in, attempt_id)
VALUES (${literal(identity.connectorInstanceId)}, ${literal(integrationKind)}, ${literal(identity.connectorKey)},
        ${literal(identity.lineageId)}, ${literal(migration.id)}, ${literal(provider)}, ${literal(migration.checksum)},
        ${migration.revision}, ${literal(migration.introducedIn)}, ${literal(attemptId)})
ON CONFLICT (connector_instance_id, integration_kind, connector_key, lineage_id, migration_id) DO NOTHING;`;
}

export function upsertConnectorInstance(
    integrationKind: string,
    version: string,
    provider: string,
    identity: IntegrationConnectorMigrationDeployment,
    baselineDigest: string,
): string {
    return `INSERT INTO ${RUNTIME_SCHEMA}.connector_instances
    (connector_instance_id, integration_kind, connector_key, lineage_id, provider, migration_revision,
     baseline_digest, package_version)
VALUES (${literal(identity.connectorInstanceId)}, ${literal(integrationKind)}, ${literal(identity.connectorKey)},
        ${literal(identity.lineageId)}, ${literal(provider)}, ${identity.migrationRevision},
        ${literal(baselineDigest)}, ${literal(version)})
ON CONFLICT (connector_instance_id, integration_kind, connector_key, lineage_id)
DO UPDATE SET migration_revision = EXCLUDED.migration_revision, baseline_digest = EXCLUDED.baseline_digest,
              package_version = EXCLUDED.package_version, updated_at = statement_timestamp();`;
}

export function updateConnectorRevision(
    integrationKind: string,
    version: string,
    identity: IntegrationConnectorMigrationDeployment,
    revision: number,
): string {
    return `UPDATE ${RUNTIME_SCHEMA}.connector_instances
SET migration_revision = GREATEST(migration_revision, ${revision}), package_version = ${literal(version)},
    updated_at = statement_timestamp()
WHERE connector_instance_id = ${literal(identity.connectorInstanceId)}
  AND integration_kind = ${literal(integrationKind)}
  AND connector_key = ${literal(identity.connectorKey)}
  AND lineage_id = ${literal(identity.lineageId)};`;
}

export function advisoryLock(value: string): string {
    return `SELECT pg_advisory_xact_lock(hashtextextended(${literal(value)}, 0));`;
}

export function migrationIdentity(integrationKind: string, migration: IntegrationConnectorMigrationDeployment): string {
    return [integrationKind, migration.connectorKey, migration.lineageId, migration.connectorInstanceId].join(":");
}

function assertionBlock(condition: string, message: string): string {
    return `DO $cms_assert$ BEGIN IF ${condition} THEN RAISE EXCEPTION ${literal(message)}; END IF; END $cms_assert$;`;
}
