import type { SQL } from "bun";
import { join } from "node:path";
import {
    adoptLegacyConnectorBaseline,
    legacyBaselineAdoptionConfirmation,
    type IntegrationInstallationRepository,
    type ResolvedIntegrationPackageRoot,
} from "@bernouy/cms-integrations";
import { ConfiguredSupabaseConnectorBaselineAdopter, loadSupabaseSqlSchemas } from "@bernouy/cms-integrations/supabase";
import type { MaterializedIntegrationPackage } from "@bernouy/cms-integration-packages/fs";
import type { RealPostgresSupabaseManagementApi } from "./managementApi";
import type { OfficialPhotoAlbumsRelease } from "./release";
import { officialSupabaseMigrationConfig } from "./runtime";

export async function prepareOfficialSourceInstallation(input: {
    database: SQL;
    installations: IntegrationInstallationRepository;
    management: RealPostgresSupabaseManagementApi;
    release: OfficialPhotoAlbumsRelease;
    sourcePackage: MaterializedIntegrationPackage;
    targetPackage: MaterializedIntegrationPackage;
}): Promise<void> {
    const sourceConnector = input.release.sourcePackage.definition.connectors?.find(
        ({ provider }) => provider === "supabase",
    );
    if (!sourceConnector) {
        throw new Error("Official Photo Albums source connector is missing");
    }
    const connectorRoot = join(input.sourcePackage.root, sourceConnector.root ?? "");
    const schemas = await loadSupabaseSqlSchemas(connectorRoot, sourceConnector.schemas);
    for (const schema of schemas) {
        await input.database.unsafe(schema.sql);
    }
    const source = await input.installations.create({
        id: "photo-albums",
        label: input.release.sourcePackage.definition.label,
        definitionVersion: "1.0.0",
        definitionSnapshot: input.release.sourcePackage.definition,
        packageDigest: input.release.source.digest,
        status: "success",
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
    });
    const target = targetPackageRoot(input.release, input.targetPackage);
    await adoptLegacyConnectorBaseline({
        installations: input.installations,
        installation: source,
        targetPackage: target,
        connectorKey: input.release.connectorKey,
        actor: "official-integration-verifier",
        confirmation: legacyBaselineAdoptionConfirmation({
            integrationId: "photo-albums",
            sourceVersion: "1.0.0",
            sourcePackageDigest: input.release.source.digest,
            targetVersion: "1.1.0",
            targetPackageDigest: input.release.target.digest,
            connectorKey: input.release.connectorKey,
        }),
        adopters: [new ConfiguredSupabaseConnectorBaselineAdopter(officialSupabaseMigrationConfig(input.management))],
    });
}

export function targetPackageRoot(
    release: OfficialPhotoAlbumsRelease,
    materialized: MaterializedIntegrationPackage,
): ResolvedIntegrationPackageRoot {
    return {
        root: materialized.root,
        kind: "photo-albums",
        version: "1.1.0",
        digest: release.target.digest,
        definition: release.targetPackage.definition,
    };
}

export async function readOfficialMigrationDatabaseEvidence(database: SQL) {
    const ledger = await database.unsafe(`SELECT migration_id::text AS "migrationId",
       checksum::text AS checksum, migration_revision::int AS revision,
       source_package_digest::text AS "sourcePackageDigest",
       target_package_digest::text AS "targetPackageDigest"
FROM cms_integration_runtime.migration_ledger
WHERE integration_kind = 'photo-albums'
ORDER BY migration_revision, migration_id`);
    const instances = await database.unsafe(`SELECT connector_key::text AS "connectorKey",
       lineage_id::text AS "lineageId", migration_revision::int AS revision,
       package_version::text AS "packageVersion", package_digest::text AS "packageDigest",
       baseline_digest::text AS "baselineDigest"
FROM cms_integration_runtime.connector_instances
WHERE integration_kind = 'photo-albums'`);
    const relations = await database.unsafe(`SELECT
    to_regclass('photo_albums.photos') IS NOT NULL AS "sourceInstalled",
    to_regclass('photo_albums.photo_credits') IS NOT NULL AS "targetInstalled"`);
    return {
        ledger: [...ledger] as Array<Record<string, unknown>>,
        instances: [...instances] as Array<Record<string, unknown>>,
        relations: [...relations] as Array<Record<string, unknown>>,
    };
}
