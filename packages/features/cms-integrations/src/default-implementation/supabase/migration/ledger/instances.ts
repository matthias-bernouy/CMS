import type { IntegrationConnectorMigrationDeployment } from "../../../../interfaces/IntegrationConnectorDeployer";
import { literal } from "../sqlFormat";
import { RUNTIME_SCHEMA } from "./schema";

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
    packageDigest: string,
): string {
    if (!/^[a-f0-9]{64}$/.test(packageDigest)) {
        throw new Error("Supabase connector packageDigest must be a lowercase SHA-256 digest");
    }
    return assertionBlock(
        `EXISTS (SELECT 1 FROM ${RUNTIME_SCHEMA}.connector_instances
          WHERE connector_instance_id = ${literal(identity.connectorInstanceId)}
            AND integration_kind = ${literal(integrationKind)}
            AND connector_key = ${literal(identity.connectorKey)}
            AND lineage_id = ${literal(identity.lineageId)}
            AND ROW(provider, migration_revision, baseline_digest, package_version, package_digest)
                IS DISTINCT FROM ROW(${literal(provider)}, ${identity.migrationRevision},
                                     ${literal(identity.plan.install.digest)}, ${literal(version)},
                                     ${literal(packageDigest)}))`,
        "cms integration fresh baseline conflict",
    );
}

export function upsertConnectorInstance(
    integrationKind: string,
    version: string,
    provider: string,
    identity: IntegrationConnectorMigrationDeployment,
    baselineDigest: string,
    packageDigest: string,
): string {
    if (!/^[a-f0-9]{64}$/.test(packageDigest)) {
        throw new Error("Supabase connector packageDigest must be a lowercase SHA-256 digest");
    }
    return `INSERT INTO ${RUNTIME_SCHEMA}.connector_instances
    (connector_instance_id, integration_kind, connector_key, lineage_id, provider, migration_revision,
     baseline_digest, package_version, package_digest)
VALUES (${literal(identity.connectorInstanceId)}, ${literal(integrationKind)}, ${literal(identity.connectorKey)},
        ${literal(identity.lineageId)}, ${literal(provider)}, ${identity.migrationRevision},
        ${literal(baselineDigest)}, ${literal(version)}, ${literal(packageDigest)})
ON CONFLICT (connector_instance_id, integration_kind, connector_key, lineage_id)
DO UPDATE SET migration_revision = EXCLUDED.migration_revision, baseline_digest = EXCLUDED.baseline_digest,
              package_version = EXCLUDED.package_version, package_digest = EXCLUDED.package_digest,
              updated_at = statement_timestamp();`;
}

export function updateConnectorRevision(
    integrationKind: string,
    version: string,
    identity: IntegrationConnectorMigrationDeployment,
    revision: number,
    packageDigest?: string,
): string {
    if (packageDigest && !/^[a-f0-9]{64}$/.test(packageDigest)) {
        throw new Error("Supabase connector packageDigest must be a lowercase SHA-256 digest");
    }
    const packageUpdate = packageDigest ? `, package_digest = ${literal(packageDigest)}` : "";
    return `UPDATE ${RUNTIME_SCHEMA}.connector_instances
SET migration_revision = GREATEST(migration_revision, ${revision}), package_version = ${literal(version)},
    updated_at = statement_timestamp()${packageUpdate}
WHERE connector_instance_id = ${literal(identity.connectorInstanceId)}
  AND integration_kind = ${literal(integrationKind)}
  AND connector_key = ${literal(identity.connectorKey)}
  AND lineage_id = ${literal(identity.lineageId)};`;
}

export function advisoryLock(value: string): string {
    return `SELECT pg_advisory_xact_lock(hashtextextended(${literal(value)}, 0));`;
}

export function runtimeSchemaAdvisoryLock(): string {
    return advisoryLock("cms-integration-runtime-schema-v1");
}

export function migrationIdentity(integrationKind: string, migration: IntegrationConnectorMigrationDeployment): string {
    return [integrationKind, migration.connectorKey, migration.lineageId, migration.connectorInstanceId].join(":");
}

function assertionBlock(condition: string, message: string): string {
    return `DO $cms_assert$ BEGIN IF ${condition} THEN RAISE EXCEPTION ${literal(message)}; END IF; END $cms_assert$;`;
}
