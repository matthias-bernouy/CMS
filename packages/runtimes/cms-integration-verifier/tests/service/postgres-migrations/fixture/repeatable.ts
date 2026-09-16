import { computeIntegrationPackageDigest, sha256Hex } from "@bernouy/cms-integration-packages";
import type { DeclarativeConnectorMigrationPlan } from "@bernouy/cms-integrations";
import { sourceDefinition, targetDefinition } from "./definitions";
import { fixtureInstallDigest } from "./installDigest";
import { packageEnvelope } from "./packages";

const SOURCE_SQL = `CREATE SCHEMA IF NOT EXISTS migration_probe;
CREATE TABLE IF NOT EXISTS migration_probe.items (id bigint PRIMARY KEY);
`;
const TARGET_SQL = `CREATE SCHEMA IF NOT EXISTS migration_probe;
CREATE TABLE IF NOT EXISTS migration_probe.items (id bigint PRIMARY KEY, description text);
`;
const REPEATABLE_SQL = "ALTER TABLE migration_probe.items ADD COLUMN IF NOT EXISTS description text;\n";

export async function repeatableMigrationPackageFixture() {
    const sourceInstallDigest = await fixtureInstallDigest(SOURCE_SQL);
    const targetInstallDigest = await fixtureInstallDigest(TARGET_SQL);
    const sourceEnvelope = packageEnvelope("1.0.0", sourceDefinition(sourceInstallDigest), SOURCE_SQL);
    const source = { digest: await computeIntegrationPackageDigest(sourceEnvelope), envelope: sourceEnvelope };
    const repeatableChecksum = `sha256:${await sha256Hex(new TextEncoder().encode(REPEATABLE_SQL))}` as const;
    const targetPlan: DeclarativeConnectorMigrationPlan = {
        install: { revision: 0, digest: targetInstallDigest, coveredMigrations: [] },
        migrations: [],
        repeatables: [
            {
                id: "items-description",
                checksum: repeatableChecksum,
                path: "repeatables/items-description.sql",
            },
        ],
        supportedSources: [{ range: "1.0.0", migrationRevision: 0 }],
        pointOfNoReturn: "before-contract",
    };
    const targetEnvelope = packageEnvelope("1.1.0", targetDefinition(targetPlan, undefined, 0), TARGET_SQL, {
        "connectors/supabase/repeatables/items-description.sql": {
            encoding: "utf8",
            content: REPEATABLE_SQL,
        },
    });
    return {
        source,
        target: { digest: await computeIntegrationPackageDigest(targetEnvelope), envelope: targetEnvelope },
        targetPlan,
        connectorKey: "primary",
        lineageId: "migration-probe-v1",
        sourceMigrationRevision: 0,
        targetMigrationRevision: 0,
    };
}
