import {
    computeIntegrationPackageDigest,
    sha256Hex,
    type IntegrationPackageEnvelopeV1,
} from "@bernouy/cms-integration-packages";
import type { DeclarativeConnectorMigrationPlan } from "@bernouy/cms-integrations";
import { legacySourceDefinition, sourceDefinition, targetDefinition } from "./definitions";
import { fixtureInstallDigest } from "./installDigest";

const KIND = "migration-probe";
const CONNECTOR_ROOT = "connectors/supabase";
const SOURCE_SQL = `CREATE SCHEMA IF NOT EXISTS migration_probe;
CREATE TABLE IF NOT EXISTS migration_probe.items (id bigint PRIMARY KEY);
`;
const TARGET_SQL = `CREATE SCHEMA IF NOT EXISTS migration_probe;
CREATE TABLE IF NOT EXISTS migration_probe.items (id bigint PRIMARY KEY, description text);
ALTER TABLE migration_probe.items ADD COLUMN IF NOT EXISTS description text;
`;
export const MIGRATION_SQL = "ALTER TABLE migration_probe.items ADD COLUMN IF NOT EXISTS description text;\n";

export type MigrationPackageFixture = Awaited<ReturnType<typeof migrationPackageFixture>>;

export async function migrationPackageFixture(
    migrationSql = MIGRATION_SQL,
    options: Readonly<{
        sourceSql?: string;
        targetSql?: string;
        sourceInstallDigest?: `sha256:${string}`;
        targetInstallDigest?: `sha256:${string}`;
        legacySourceInstallDigest?: `sha256:${string}`;
        sourceSchema?: unknown;
        targetSchema?: unknown;
        equivalence?: NonNullable<DeclarativeConnectorMigrationPlan["equivalence"]>;
    }> = {},
) {
    const sourceSql = options.sourceSql ?? SOURCE_SQL;
    const targetSql = options.targetSql ?? TARGET_SQL;
    const sourceInstallDigest = options.sourceInstallDigest ?? (await fixtureInstallDigest(sourceSql));
    const targetInstallDigest = options.targetInstallDigest ?? (await fixtureInstallDigest(targetSql));
    const sourceEnvelope = packageEnvelope(
        "1.0.0",
        options.legacySourceInstallDigest
            ? legacySourceDefinition()
            : sourceDefinition(sourceInstallDigest, options.sourceSchema),
        sourceSql,
    );
    const source = { digest: await computeIntegrationPackageDigest(sourceEnvelope), envelope: sourceEnvelope };
    const migrationChecksum = `sha256:${await sha256Hex(new TextEncoder().encode(migrationSql))}` as const;
    const targetPlan: DeclarativeConnectorMigrationPlan = {
        install: {
            revision: 1,
            digest: targetInstallDigest,
            coveredMigrations: [
                {
                    id: "add-description",
                    checksum: migrationChecksum,
                    revision: 1,
                    introducedIn: "1.1.0",
                },
            ],
        },
        migrations: [
            {
                id: "add-description",
                checksum: migrationChecksum,
                fromRevision: 0,
                toRevision: 1,
                introducedIn: "1.1.0",
                transaction: "atomic",
                phase: "expand",
                path: "migrations/0001-add-description.sql",
            },
        ],
        supportedSources: [
            {
                range: "1.0.0",
                migrationRevision: 0,
                ...(options.legacySourceInstallDigest
                    ? {
                          legacyAdoption: {
                              definitionVersion: "1.0.0",
                              packageDigest: source.digest,
                              installDigest: options.legacySourceInstallDigest,
                              observedSchema: {
                                  schema: "cms.integration.observed-schema.v1",
                                  owner: { connectorKey: "primary", lineageId: "migration-probe-v1" },
                                  namespaces: [],
                              },
                              coveredMigrations: [],
                          },
                      }
                    : {}),
            },
        ],
        ...(options.equivalence ? { equivalence: options.equivalence } : {}),
        pointOfNoReturn: "before-contract",
    };
    const targetEnvelope = packageEnvelope("1.1.0", targetDefinition(targetPlan, options.targetSchema), targetSql, {
        "connectors/supabase/migrations/0001-add-description.sql": {
            encoding: "utf8",
            content: migrationSql,
        },
    });
    return {
        source,
        target: { digest: await computeIntegrationPackageDigest(targetEnvelope), envelope: targetEnvelope },
        targetPlan,
        connectorKey: "primary",
        lineageId: "migration-probe-v1",
        sourceMigrationRevision: 0,
        targetMigrationRevision: 1,
    };
}

export async function unrelatedPackage(index = 0) {
    const kind = `unrelated-${index}`;
    const envelope = packageEnvelope(
        "1.0.0",
        { kind, label: "Unrelated", version: "1.0.0", inputs: [] },
        "SELECT 1;\n",
        {},
        kind,
    );
    return { digest: await computeIntegrationPackageDigest(envelope), envelope };
}

function packageEnvelope(
    version: string,
    definition: unknown,
    sql: string,
    extraFiles: IntegrationPackageEnvelopeV1["files"] = {},
    kind = KIND,
): IntegrationPackageEnvelopeV1 {
    return {
        schema: "cms.integration.package.v1",
        kind,
        version,
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": { encoding: "utf8", content: JSON.stringify(definition) },
            "release-notes.md": { encoding: "utf8", content: `Migration probe ${version}` },
            [`${CONNECTOR_ROOT}/install/schema.manifest.json`]: {
                encoding: "utf8",
                content: JSON.stringify({
                    schema: "cms.integration.sql-bundle.v1",
                    transaction: "atomic",
                    entries: [{ file: "schema.sql" }],
                }),
            },
            [`${CONNECTOR_ROOT}/install/schema.sql`]: { encoding: "utf8", content: sql },
            ...extraFiles,
        },
    };
}
