import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { identifyObservedSchemaContract, projectObservedSchemaContract } from "@bernouy/cms-integrations";
import { OFFICIAL_SCHEMA_BASELINE_POSTGRES_VERSION } from "@bernouy/cms-official-integrations/publication";
import { DisposableSchemaCalibrationCluster } from "../../database";
import { schemaCalibrationEnvironmentIdentity } from "../../environment/manifest";
import {
    assertPhotoAlbumsMigrationLedger,
    assertPhotoCreditSecurity,
    assertSameObservedSchema,
    executePhotoAlbumsMigration,
    installFreshPhotoAlbums,
    migrateLegacyPhotoAlbums,
    observePhotoAlbums,
} from "./photoAlbumsDatabase";
import { loadPhotoAlbumsReleaseContext } from "./photoAlbumsContext";

export type PhotoAlbumsReleaseVerificationReport = Readonly<{
    schema: "cms.integration.photo-albums-release-verification.v1";
    sourcePackageDigest: string;
    targetPackageDigest: string;
    observedSchemaDigest: string;
    environmentDigest: string;
    runnerImage: string;
    postgresVersion: string;
    migrationIds: readonly string[];
    repeatableIds: readonly string[];
    freshDeterministic: true;
    freshRerunDeterministic: true;
    migratedEquivalent: true;
    migrationRerunDeterministic: true;
    declaredSchemaMatchesObserved: true;
    rowLevelSecurityVerified: true;
}>;

export async function verifyPhotoAlbumsAdditiveRelease(options: {
    env: Record<string, string | undefined>;
    officialRoot: string;
}): Promise<PhotoAlbumsReleaseVerificationReport> {
    const context = await loadPhotoAlbumsReleaseContext(options.officialRoot);
    const environment = await schemaCalibrationEnvironmentIdentity();
    const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
    const cluster = new DisposableSchemaCalibrationCluster(options.env);
    try {
        const freshA = await cluster.create(`cmscore_contracts_photo_release_${suffix}_a`, environment);
        const freshB = await cluster.create(`cmscore_contracts_photo_release_${suffix}_b`, environment);
        const migrated = await cluster.create(`cmscore_contracts_photo_release_${suffix}_m`, environment);
        const postgresVersion = await readPostgresVersion(freshA.sql);
        if (postgresVersion !== OFFICIAL_SCHEMA_BASELINE_POSTGRES_VERSION) {
            throw new Error(
                `Photo Albums release verification requires PostgreSQL ${OFFICIAL_SCHEMA_BASELINE_POSTGRES_VERSION}, received ${postgresVersion}`,
            );
        }
        const firstFresh = await installFreshPhotoAlbums(freshA, context, "fresh-a");
        const secondFresh = await installFreshPhotoAlbums(freshB, context, "fresh-b");
        assertSameObservedSchema(firstFresh, secondFresh, "fresh installs are not deterministic");
        await installFreshPhotoAlbums(freshA, context, "fresh-a-rerun");
        const rerunFresh = await observePhotoAlbums(freshA, context.targetConnector);
        assertSameObservedSchema(firstFresh, rerunFresh, "fresh install rerun changed the observed schema");

        const migratedSchema = await migrateLegacyPhotoAlbums(migrated, context);
        assertSameObservedSchema(firstFresh, migratedSchema, "migrated schema differs from a fresh target install");
        await executePhotoAlbumsMigration(migrated.sql, context, "migration-rerun");
        const rerunMigrated = await observePhotoAlbums(migrated, context.targetConnector);
        assertSameObservedSchema(migratedSchema, rerunMigrated, "migration rerun changed the observed schema");
        if (
            !context.targetConnector.compatibility?.schema ||
            !isDeepStrictEqual(context.targetConnector.compatibility.schema, projectObservedSchemaContract(firstFresh))
        ) {
            throw new Error("Photo Albums declared schema differs from the observed target schema");
        }
        await assertPhotoCreditSecurity(freshA.sql);
        await assertPhotoCreditSecurity(migrated.sql);
        await assertPhotoAlbumsMigrationLedger(migrated.sql, context);

        return {
            schema: "cms.integration.photo-albums-release-verification.v1",
            sourcePackageDigest: context.source.digest,
            targetPackageDigest: context.target.digest,
            observedSchemaDigest: (await identifyObservedSchemaContract(firstFresh)).digest,
            environmentDigest: environment.digest,
            runnerImage: environment.image,
            postgresVersion,
            migrationIds: context.migrations.map(({ id }) => id),
            repeatableIds: context.repeatables.map(({ id }) => id),
            freshDeterministic: true,
            freshRerunDeterministic: true,
            migratedEquivalent: true,
            migrationRerunDeterministic: true,
            declaredSchemaMatchesObserved: true,
            rowLevelSecurityVerified: true,
        };
    } finally {
        await cluster.close();
    }
}

async function readPostgresVersion(database: import("bun").SQL): Promise<string> {
    const rows = await database<{ version: string }[]>`
        SELECT current_setting('server_version_num') AS version
    `;
    const version = rows[0]?.version;
    if (!version) {
        throw new Error("Photo Albums release verification could not identify PostgreSQL");
    }
    return version;
}
