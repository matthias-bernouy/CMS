import type { IntegrationConnectorBaselineAdoptionContext } from "../../../../interfaces/IntegrationConnectorDeployer";
import { advisoryLock, ledgerDdl } from "../ledgerSql";
import { literal } from "../sqlFormat";

export function buildSupabaseBaselineAdoptionSql(
    context: IntegrationConnectorBaselineAdoptionContext,
    baselineDigest: string,
): string {
    return [
        "BEGIN;",
        ledgerDdl(),
        advisoryLock(adoptionIdentity(context)),
        conflictingIdentityAssertion(context),
        conflictingBaselineAssertion(context, baselineDigest),
        insertAdoptedInstance(context, baselineDigest),
        "COMMIT;",
    ].join("\n");
}

export function confirmSupabaseBaselineAdoptionSql(
    context: IntegrationConnectorBaselineAdoptionContext,
    baselineDigest: string,
): string {
    return `SELECT migration_revision, baseline_digest, package_version
FROM cms_integration_runtime.connector_instances
WHERE connector_instance_id = ${literal(context.connectorInstanceId)}
  AND integration_kind = ${literal(context.integrationKind)}
  AND connector_key = ${literal(context.connectorKey)}
  AND lineage_id = ${literal(context.lineageId)}
  AND provider = ${literal(context.provider)}
  AND migration_revision = ${context.migrationRevision}
  AND baseline_digest = ${literal(baselineDigest)}
  AND package_version = ${literal(context.sourceVersion)};`;
}

function conflictingIdentityAssertion(context: IntegrationConnectorBaselineAdoptionContext): string {
    return assertionBlock(
        `EXISTS (SELECT 1 FROM cms_integration_runtime.connector_instances
          WHERE connector_instance_id = ${literal(context.connectorInstanceId)}
            AND (integration_kind, connector_key, lineage_id, provider) <>
                (${literal(context.integrationKind)}, ${literal(context.connectorKey)},
                 ${literal(context.lineageId)}, ${literal(context.provider)}))`,
        "cms integration connector identity conflict",
    );
}

function conflictingBaselineAssertion(
    context: IntegrationConnectorBaselineAdoptionContext,
    baselineDigest: string,
): string {
    return assertionBlock(
        `EXISTS (SELECT 1 FROM cms_integration_runtime.connector_instances
          WHERE connector_instance_id = ${literal(context.connectorInstanceId)}
            AND integration_kind = ${literal(context.integrationKind)}
            AND connector_key = ${literal(context.connectorKey)}
            AND lineage_id = ${literal(context.lineageId)}
            AND (provider, migration_revision, baseline_digest, package_version) <>
                (${literal(context.provider)}, ${context.migrationRevision},
                 ${literal(baselineDigest)}, ${literal(context.sourceVersion)}))`,
        "cms integration legacy baseline conflict",
    );
}

function insertAdoptedInstance(context: IntegrationConnectorBaselineAdoptionContext, baselineDigest: string): string {
    return `INSERT INTO cms_integration_runtime.connector_instances
    (connector_instance_id, integration_kind, connector_key, lineage_id, provider, migration_revision,
     baseline_digest, package_version)
VALUES (${literal(context.connectorInstanceId)}, ${literal(context.integrationKind)},
        ${literal(context.connectorKey)}, ${literal(context.lineageId)}, ${literal(context.provider)},
        ${context.migrationRevision}, ${literal(baselineDigest)}, ${literal(context.sourceVersion)})
ON CONFLICT (connector_instance_id, integration_kind, connector_key, lineage_id) DO NOTHING;`;
}

function adoptionIdentity(context: IntegrationConnectorBaselineAdoptionContext): string {
    return [context.integrationKind, context.connectorKey, context.lineageId, context.connectorInstanceId].join(":");
}

function assertionBlock(condition: string, message: string): string {
    return `DO $cms_assert$ BEGIN IF ${condition} THEN RAISE EXCEPTION ${literal(message)}; END IF; END $cms_assert$;`;
}
