import { resolve } from "node:path";
import type {
    DeclarativeConnectorTemplate,
    IntegrationConnectorBaselineAdoptionContext,
    IntegrationConnectorMigrationDeployment,
} from "@bernouy/cms-integrations";
import {
    loadSupabaseMigrationAssets,
    loadSupabaseRepeatableAssets,
    loadSupabaseSqlSchemas,
} from "@bernouy/cms-integrations/supabase";
import {
    buildOfficialIntegrationPackages,
    type BuiltOfficialIntegrationPackage,
} from "@bernouy/cms-official-integrations/publication";
import { materializeOfficialIntegrationPackage } from "../../../../materializedPackage";

export const PHOTO_ALBUMS_KIND = "photo-albums";
export const PHOTO_ALBUMS_SOURCE_VERSION = "1.0.0";
export const PHOTO_ALBUMS_TARGET_VERSION = "1.1.0";
export const PHOTO_ALBUMS_CONNECTOR_INSTANCE_ID = "photo-albums-release-verification";

export type PhotoAlbumsReleaseContext = Awaited<ReturnType<typeof loadPhotoAlbumsReleaseContext>>;

export async function loadPhotoAlbumsReleaseContext(officialRoot: string) {
    const packages = await buildOfficialIntegrationPackages(officialRoot);
    const source = exactPackage(packages, PHOTO_ALBUMS_SOURCE_VERSION);
    const target = exactPackage(packages, PHOTO_ALBUMS_TARGET_VERSION);
    const sourceConnector = requiredConnector(source);
    const targetConnector = requiredConnector(target);
    if (
        !targetConnector.connectorKey ||
        !targetConnector.lineageId ||
        targetConnector.migrationRevision === undefined ||
        !targetConnector.migration
    ) {
        throw new Error("Photo Albums target connector is not migration-aware");
    }
    const [sourcePackageRoot, targetPackageRoot] = await Promise.all([
        materializeOfficialIntegrationPackage(source),
        materializeOfficialIntegrationPackage(target),
    ]);
    const sourceRoot = resolve(sourcePackageRoot, sourceConnector.root ?? ".");
    const targetRoot = resolve(targetPackageRoot, targetConnector.root ?? ".");
    const [sourceSchemas, targetSchemas, migrations, repeatables] = await Promise.all([
        loadSupabaseSqlSchemas(sourceRoot, sourceConnector.schemas ?? []),
        loadSupabaseSqlSchemas(targetRoot, targetConnector.schemas ?? []),
        loadSupabaseMigrationAssets(targetRoot, targetConnector.migration.migrations),
        loadSupabaseRepeatableAssets(targetRoot, targetConnector.migration.repeatables ?? []),
    ]);
    const legacySource = targetConnector.migration.supportedSources.find(
        ({ range, migrationRevision }) => range === PHOTO_ALBUMS_SOURCE_VERSION && migrationRevision === 0,
    );
    if (!legacySource?.legacyAdoption) {
        throw new Error("Photo Albums exact legacy adoption baseline is missing");
    }
    return {
        source,
        target,
        sourceConnector,
        targetConnector,
        sourceSchemas,
        targetSchemas,
        migrations,
        repeatables,
        legacySource,
    };
}

export function photoAlbumsTargetDeployment(
    context: PhotoAlbumsReleaseContext,
    revision: number,
): IntegrationConnectorMigrationDeployment {
    return {
        connectorKey: context.targetConnector.connectorKey!,
        lineageId: context.targetConnector.lineageId!,
        connectorInstanceId: PHOTO_ALBUMS_CONNECTOR_INSTANCE_ID,
        migrationRevision: revision,
        plan: context.targetConnector.migration!,
    };
}

export function photoAlbumsAdoptionContext(
    context: PhotoAlbumsReleaseContext,
): IntegrationConnectorBaselineAdoptionContext {
    return {
        integrationKind: PHOTO_ALBUMS_KIND,
        sourceVersion: PHOTO_ALBUMS_SOURCE_VERSION,
        sourcePackageDigest: context.source.digest,
        targetVersion: PHOTO_ALBUMS_TARGET_VERSION,
        targetPackageDigest: context.target.digest,
        connectorKey: context.targetConnector.connectorKey!,
        provider: "supabase",
        lineageId: context.targetConnector.lineageId!,
        connectorInstanceId: PHOTO_ALBUMS_CONNECTOR_INSTANCE_ID,
        migrationRevision: context.legacySource.migrationRevision,
        baseline: context.legacySource.legacyAdoption!,
        coveredMigrations: context.legacySource.legacyAdoption!.coveredMigrations,
        attemptId: "photo-albums-legacy-adoption",
    };
}

function exactPackage(
    packages: readonly BuiltOfficialIntegrationPackage[],
    version: string,
): BuiltOfficialIntegrationPackage {
    const integrationPackage = packages.find((entry) => entry.kind === PHOTO_ALBUMS_KIND && entry.version === version);
    if (!integrationPackage) {
        throw new Error(`Photo Albums ${version} package is missing`);
    }
    return integrationPackage;
}

function requiredConnector(integrationPackage: BuiltOfficialIntegrationPackage): DeclarativeConnectorTemplate {
    const connector = integrationPackage.definition.connectors?.find(({ provider }) => provider === "supabase");
    if (!connector) {
        throw new Error(`Photo Albums ${integrationPackage.version} Supabase connector is missing`);
    }
    return connector;
}
