import type { IntegrationConnectorBaselineAdoptionContext } from "../../../../interfaces/IntegrationConnectorDeployer";
import { sameConnectorMigrationReferences } from "cms-integrations/core/definitions/migrationReferences";
import {
    advisoryLock,
    assertAdoptedLedgerEntryCompatible,
    assertLedgerEntryCompatible,
    insertLedger,
    ledgerDdl,
    RUNTIME_SCHEMA,
    runtimeSchemaAdvisoryLock,
} from "../ledger";
import { literal } from "../sqlFormat";

export function buildSupabaseBaselineAdoptionSql(
    context: IntegrationConnectorBaselineAdoptionContext,
    baselineDigest: string,
): string {
    assertAdoptionContext(context);
    return [
        "BEGIN;",
        runtimeSchemaAdvisoryLock(),
        ledgerDdl(),
        advisoryLock(adoptionIdentity(context)),
        conflictingIdentityAssertion(context),
        ...context.coveredMigrations.flatMap((migration) => [
            assertLedgerEntryCompatible(context.integrationKind, context, migration),
            assertAdoptedLedgerEntryCompatible(
                context.integrationKind,
                context.provider,
                context,
                migration,
                context.sourcePackageDigest,
            ),
        ]),
        adoptLegacyPackageDigest(context, baselineDigest),
        conflictingBaselineAssertion(context, baselineDigest),
        ...context.coveredMigrations.map((migration) =>
            insertLedger(context.integrationKind, context.provider, context, migration, context.attemptId, {
                sourcePackageDigest: context.sourcePackageDigest,
                attemptId: context.attemptId,
            }),
        ),
        insertAdoptedInstance(context, baselineDigest),
        "COMMIT;",
    ].join("\n");
}

export function confirmSupabaseBaselineAdoptionSql(
    context: IntegrationConnectorBaselineAdoptionContext,
    baselineDigest: string,
): string {
    assertAdoptionContext(context);
    const expected = expectedLedgerRows(context);
    return `SELECT migration_revision, baseline_digest, package_version, package_digest
FROM cms_integration_runtime.connector_instances
WHERE connector_instance_id = ${literal(context.connectorInstanceId)}
  AND integration_kind = ${literal(context.integrationKind)}
  AND connector_key = ${literal(context.connectorKey)}
  AND lineage_id = ${literal(context.lineageId)}
  AND provider = ${literal(context.provider)}
  AND migration_revision = ${context.migrationRevision}
  AND baseline_digest = ${literal(baselineDigest)}
  AND package_version = ${literal(context.sourceVersion)}
  AND package_digest = ${literal(context.sourcePackageDigest)}
  AND (SELECT count(*) FROM ${RUNTIME_SCHEMA}.migration_ledger ledger
        WHERE ${ledgerIdentity("ledger", context)}) = ${context.coveredMigrations.length}
  AND NOT EXISTS (
      SELECT 1 FROM ${expected}
       WHERE NOT EXISTS (
           SELECT 1 FROM ${RUNTIME_SCHEMA}.migration_ledger ledger
            WHERE ${ledgerIdentity("ledger", context)}
              AND ledger.migration_id = expected.migration_id
              AND ledger.provider = ${literal(context.provider)}
              AND ledger.checksum = expected.checksum
              AND ledger.migration_revision = expected.migration_revision
              AND ledger.introduced_in = expected.introduced_in
              AND btrim(ledger.attempt_id) <> ''
              AND ledger.source_package_digest = ${literal(context.sourcePackageDigest)}
              AND ledger.target_package_digest IS NULL
              AND ledger.operation_id IS NULL
              AND ledger.fencing_token IS NULL
       )
  );`;
}

function expectedLedgerRows(context: IntegrationConnectorBaselineAdoptionContext): string {
    if (context.coveredMigrations.length === 0) {
        return `(SELECT NULL::text AS migration_id, NULL::text AS checksum,
                        NULL::bigint AS migration_revision, NULL::text AS introduced_in
                  WHERE FALSE) expected`;
    }
    const rows = context.coveredMigrations.map(
        (migration) =>
            `(${literal(migration.id)}, ${literal(migration.checksum)}, ${migration.revision}, ${literal(migration.introducedIn)})`,
    );
    return `(VALUES ${rows.join(", ")}) expected(migration_id, checksum, migration_revision, introduced_in)`;
}

function ledgerIdentity(alias: string, context: IntegrationConnectorBaselineAdoptionContext): string {
    return `${alias}.connector_instance_id = ${literal(context.connectorInstanceId)}
          AND ${alias}.integration_kind = ${literal(context.integrationKind)}
          AND ${alias}.connector_key = ${literal(context.connectorKey)}
          AND ${alias}.lineage_id = ${literal(context.lineageId)}`;
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
            AND ROW(provider, migration_revision, baseline_digest, package_version, package_digest)
                IS DISTINCT FROM ROW(${literal(context.provider)}, ${context.migrationRevision},
                                     ${literal(baselineDigest)}, ${literal(context.sourceVersion)},
                                     ${literal(context.sourcePackageDigest)}))`,
        "cms integration legacy baseline conflict",
    );
}

function adoptLegacyPackageDigest(
    context: IntegrationConnectorBaselineAdoptionContext,
    baselineDigest: string,
): string {
    return `UPDATE cms_integration_runtime.connector_instances
SET package_digest = ${literal(context.sourcePackageDigest)}, updated_at = statement_timestamp()
WHERE connector_instance_id = ${literal(context.connectorInstanceId)}
  AND integration_kind = ${literal(context.integrationKind)}
  AND connector_key = ${literal(context.connectorKey)}
  AND lineage_id = ${literal(context.lineageId)}
  AND provider = ${literal(context.provider)}
  AND migration_revision = ${context.migrationRevision}
  AND baseline_digest = ${literal(baselineDigest)}
  AND package_version = ${literal(context.sourceVersion)}
  AND package_digest IS NULL;`;
}

function insertAdoptedInstance(context: IntegrationConnectorBaselineAdoptionContext, baselineDigest: string): string {
    return `INSERT INTO cms_integration_runtime.connector_instances
    (connector_instance_id, integration_kind, connector_key, lineage_id, provider, migration_revision,
     baseline_digest, package_version, package_digest)
VALUES (${literal(context.connectorInstanceId)}, ${literal(context.integrationKind)},
        ${literal(context.connectorKey)}, ${literal(context.lineageId)}, ${literal(context.provider)},
        ${context.migrationRevision}, ${literal(baselineDigest)}, ${literal(context.sourceVersion)},
        ${literal(context.sourcePackageDigest)})
ON CONFLICT (connector_instance_id, integration_kind, connector_key, lineage_id) DO NOTHING;`;
}

function adoptionIdentity(context: IntegrationConnectorBaselineAdoptionContext): string {
    return [context.integrationKind, context.connectorKey, context.lineageId, context.connectorInstanceId].join(":");
}

function assertAdoptionContext(context: IntegrationConnectorBaselineAdoptionContext): void {
    if (
        context.baseline.definitionVersion !== context.sourceVersion ||
        context.baseline.packageDigest !== context.sourcePackageDigest ||
        !sameConnectorMigrationReferences(context.coveredMigrations, context.baseline.coveredMigrations)
    ) {
        throw new Error("Supabase legacy adoption baseline must bind the exact source package");
    }
    if (context.coveredMigrations.some((migration) => migration.revision > context.migrationRevision)) {
        throw new Error("Supabase legacy adoption ledger must not advance beyond the source revision");
    }
}

function assertionBlock(condition: string, message: string): string {
    return `DO $cms_assert$ BEGIN IF ${condition} THEN RAISE EXCEPTION ${literal(message)}; END IF; END $cms_assert$;`;
}
