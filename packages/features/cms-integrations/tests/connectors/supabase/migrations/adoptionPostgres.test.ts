import { expect, test } from "bun:test";
import { SQL } from "bun";
import type { IntegrationConnectorBaselineAdoptionContext } from "@bernouy/cms-integrations";
import { buildSupabaseBaselineAdoptionSql } from "@bernouy/cms-integrations/supabase";

const enabled =
    process.env.ALLOW_POSTGRES_CONTRACT_SCHEMA_RESET === "cmscore-postgres-contracts" && !!process.env.DATABASE_URL;
const postgresTest = enabled ? test : test.skip;
const DATABASE = "cmscore_contracts_migration_adoption";

postgresTest("legacy adoption ledger commit is exact, idempotent, and conflict-safe", async () => {
    const baseUrl = requireDisposableDatabaseUrl();
    const admin = new SQL(baseUrl, { max: 1 });
    try {
        await admin.unsafe(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
        await admin.unsafe(`CREATE DATABASE ${DATABASE} TEMPLATE template0 ENCODING 'UTF8'`);
        const database = new SQL(databaseUrl(baseUrl), { max: 1 });
        try {
            const context = adoptionContext();
            const baselineDigest = "c".repeat(64);
            await database.unsafe(buildSupabaseBaselineAdoptionSql(context, baselineDigest));
            await database.unsafe(buildSupabaseBaselineAdoptionSql(context, baselineDigest));

            const rows = await database`
                SELECT integration_kind, connector_key, lineage_id, provider, migration_revision,
                       baseline_digest, package_version
                  FROM cms_integration_runtime.connector_instances
            `;
            expect([...rows]).toEqual([
                {
                    integration_kind: "commerce",
                    connector_key: "primary",
                    lineage_id: "commerce-supabase-v1",
                    provider: "supabase",
                    migration_revision: "1",
                    baseline_digest: baselineDigest,
                    package_version: "1.0.0",
                },
            ]);

            let conflict: unknown;
            try {
                await database.unsafe(buildSupabaseBaselineAdoptionSql(context, "d".repeat(64)));
            } catch (error) {
                conflict = error;
                await database.unsafe("ROLLBACK");
            }
            expect(conflict).toBeInstanceOf(Error);
            expect((conflict as Error).message).toMatch(/legacy baseline conflict/);
        } finally {
            await database.close();
        }
    } finally {
        await admin.unsafe(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
        await admin.close();
    }
});

function adoptionContext(): IntegrationConnectorBaselineAdoptionContext {
    return {
        integrationKind: "commerce",
        sourceVersion: "1.0.0",
        sourcePackageDigest: "a".repeat(64),
        targetVersion: "1.1.0",
        targetPackageDigest: "b".repeat(64),
        connectorKey: "primary",
        provider: "supabase",
        lineageId: "commerce-supabase-v1",
        connectorInstanceId: "connector-instance-1",
        migrationRevision: 1,
        baseline: {
            definitionVersion: "1.0.0",
            packageDigest: "a".repeat(64),
            observedSchema: {
                schema: "cms.integration.observed-schema.v1",
                owner: { connectorKey: "primary", lineageId: "commerce-supabase-v1" },
                namespaces: [{ name: "commerce", relations: [] }],
            },
        },
        attemptId: "attempt-1",
    };
}

function requireDisposableDatabaseUrl(): string {
    const value = process.env.DATABASE_URL!;
    const parsed = new URL(value);
    const database = parsed.pathname.slice(1);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || !database.startsWith("cmscore_contracts")) {
        throw new Error("migration adoption requires a loopback cmscore_contracts database");
    }
    return value;
}

function databaseUrl(base: string): string {
    const value = new URL(base);
    value.pathname = `/${DATABASE}`;
    return value.toString();
}
