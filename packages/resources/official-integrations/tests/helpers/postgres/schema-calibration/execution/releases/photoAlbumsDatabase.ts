import type { SQL } from "bun";
import {
    identifyObservedSchemaContract,
    sameObservedSchemaContract,
    type DeclarativeConnectorTemplate,
    type ObservedSchemaContractV1,
} from "@bernouy/cms-integrations";
import {
    buildSupabaseBaselineAdoptionSql,
    buildSupabaseFreshInstallSql,
    buildSupabaseMigrationPhaseSql,
    readSupabaseObservedSchemaContract,
} from "@bernouy/cms-integrations/supabase";
import type { SchemaCalibrationDatabase } from "../../database";
import { schemaCatalogClient } from "../catalogClient";
import {
    PHOTO_ALBUMS_CONNECTOR_INSTANCE_ID,
    PHOTO_ALBUMS_KIND,
    PHOTO_ALBUMS_TARGET_VERSION,
    photoAlbumsAdoptionContext,
    photoAlbumsTargetDeployment,
    type PhotoAlbumsReleaseContext,
} from "./photoAlbumsContext";

export async function installFreshPhotoAlbums(
    database: SchemaCalibrationDatabase,
    context: PhotoAlbumsReleaseContext,
    attemptId: string,
): Promise<ObservedSchemaContractV1> {
    const targetRevision = context.targetConnector.migrationRevision!;
    await database.sql.unsafe(
        buildSupabaseFreshInstallSql({
            integrationKind: PHOTO_ALBUMS_KIND,
            version: PHOTO_ALBUMS_TARGET_VERSION,
            provider: "supabase",
            migration: photoAlbumsTargetDeployment(context, targetRevision),
            schemas: context.targetSchemas,
            attemptId,
            packageDigest: context.target.digest,
        }),
    );
    await database.sql.unsafe(
        buildSupabaseMigrationPhaseSql({
            integrationKind: PHOTO_ALBUMS_KIND,
            version: PHOTO_ALBUMS_TARGET_VERSION,
            provider: "supabase",
            migration: photoAlbumsTargetDeployment(context, targetRevision),
            migrations: [],
            repeatables: context.repeatables,
            attemptId: `${attemptId}-repeatables`,
        }),
    );
    return await observePhotoAlbums(database, context.targetConnector);
}

export async function migrateLegacyPhotoAlbums(
    database: SchemaCalibrationDatabase,
    context: PhotoAlbumsReleaseContext,
): Promise<ObservedSchemaContractV1> {
    for (const { sql } of context.sourceSchemas) {
        await database.sql.unsafe(sql);
    }
    const observedLegacy = await observePhotoAlbums(database, context.targetConnector);
    assertSameObservedSchema(
        context.legacySource.legacyAdoption!.observedSchema,
        observedLegacy,
        "installed legacy schema differs from its immutable adoption baseline",
    );
    const adoption = photoAlbumsAdoptionContext(context);
    const baselineDigest = (await identifyObservedSchemaContract(adoption.baseline.observedSchema)).digest;
    await database.sql.unsafe(buildSupabaseBaselineAdoptionSql(adoption, baselineDigest));
    await executePhotoAlbumsMigration(database.sql, context, "migration-first");
    return await observePhotoAlbums(database, context.targetConnector);
}

export async function executePhotoAlbumsMigration(
    database: SQL,
    context: PhotoAlbumsReleaseContext,
    attemptId: string,
): Promise<void> {
    await database.unsafe(
        buildSupabaseMigrationPhaseSql({
            integrationKind: PHOTO_ALBUMS_KIND,
            version: PHOTO_ALBUMS_TARGET_VERSION,
            provider: "supabase",
            migration: photoAlbumsTargetDeployment(context, context.legacySource.migrationRevision),
            migrations: context.migrations,
            repeatables: context.repeatables,
            attemptId,
        }),
    );
}

export async function observePhotoAlbums(
    database: SchemaCalibrationDatabase,
    connector: DeclarativeConnectorTemplate,
): Promise<ObservedSchemaContractV1> {
    return await readSupabaseObservedSchemaContract({
        client: schemaCatalogClient(database.sql),
        owner: { connectorKey: connector.connectorKey!, lineageId: connector.lineageId! },
        ownedNamespaces: connector.dataApiSchemas ?? [],
    });
}

export function assertSameObservedSchema(
    left: ObservedSchemaContractV1,
    right: ObservedSchemaContractV1,
    message: string,
): void {
    if (!sameObservedSchemaContract(left, right)) {
        throw new Error(message);
    }
}

export async function assertPhotoCreditSecurity(database: SQL): Promise<void> {
    const rows = await database<
        { relforcerowsecurity: boolean; relrowsecurity: boolean; service_role_access: boolean; anon_access: boolean }[]
    >`
        SELECT relation.relrowsecurity,
               relation.relforcerowsecurity,
               has_table_privilege('service_role', 'photo_albums.photo_credits', 'SELECT, INSERT, UPDATE, DELETE') AS service_role_access,
               has_table_privilege('anon', 'photo_albums.photo_credits', 'SELECT') AS anon_access
          FROM pg_class relation
          JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = 'photo_albums' AND relation.relname = 'photo_credits'
    `;
    const row = rows[0];
    if (!row?.relrowsecurity || !row.relforcerowsecurity || !row.service_role_access || row.anon_access) {
        throw new Error("Photo Albums photo_credits security policy is incomplete");
    }
}

export async function assertPhotoAlbumsMigrationLedger(
    database: SQL,
    context: PhotoAlbumsReleaseContext,
): Promise<void> {
    const migrations = await database<{ checksum: string; migration_id: string; migration_revision: string }[]>`
        SELECT migration_id, checksum, migration_revision
          FROM cms_integration_runtime.migration_ledger
         WHERE integration_kind = ${PHOTO_ALBUMS_KIND}
           AND connector_instance_id = ${PHOTO_ALBUMS_CONNECTOR_INSTANCE_ID}
         ORDER BY migration_revision, migration_id
    `;
    if (
        migrations.length !== context.migrations.length ||
        migrations.some((row, index) => {
            const expected = context.migrations[index];
            return (
                row.migration_id !== expected?.id ||
                row.checksum !== expected.checksum ||
                Number(row.migration_revision) !== expected.toRevision
            );
        })
    ) {
        throw new Error("Photo Albums migration ledger does not match the declared migration chain");
    }
    const repeatables = await database<{ checksum: string; repeatable_id: string }[]>`
        SELECT repeatable_id, checksum
          FROM cms_integration_runtime.repeatable_ledger
         WHERE integration_kind = ${PHOTO_ALBUMS_KIND}
           AND connector_instance_id = ${PHOTO_ALBUMS_CONNECTOR_INSTANCE_ID}
         ORDER BY repeatable_id
    `;
    const expected = [...context.repeatables].sort((left, right) => left.id.localeCompare(right.id));
    if (
        repeatables.length !== expected.length ||
        repeatables.some(
            (row, index) => row.repeatable_id !== expected[index]?.id || row.checksum !== expected[index]?.checksum,
        )
    ) {
        throw new Error("Photo Albums repeatable ledger does not match the declared assets");
    }
}
