import { describe, expect, test } from "bun:test";
import {
    buildSupabaseFreshInstallSql,
    buildSupabaseMigrationPhaseSql,
    type LoadedSupabaseMigration,
} from "@bernouy/cms-integrations/supabase";
import type { IntegrationConnectorMigrationDeployment } from "@bernouy/cms-integrations";

const CHECKSUM_A = `sha256:${"a".repeat(64)}` as const;
const CHECKSUM_B = `sha256:${"b".repeat(64)}` as const;

describe("Supabase integration migration ledger", () => {
    test("records a fresh baseline and all incorporated migrations in the schema transaction", () => {
        const sql = buildSupabaseFreshInstallSql({
            integrationKind: "commerce",
            version: "1.1.0",
            provider: "supabase",
            migration: migrationDeployment(3),
            schemas: [
                {
                    id: "install/schema.json",
                    kind: "bundle",
                    sourceFiles: ["install/orders.sql"],
                    sql: "BEGIN;\nCREATE TABLE public.orders (id bigint PRIMARY KEY);\nCOMMIT;\n",
                },
            ],
            attemptId: "attempt-1",
            packageDigest: "d".repeat(64),
        });

        expect(sql.startsWith("BEGIN;\n")).toBe(true);
        expect(sql.endsWith("COMMIT;")).toBe(true);
        expect(sql).toContain("pg_advisory_xact_lock");
        expect(sql.indexOf("cms-integration-runtime-schema-v1")).toBeLessThan(sql.indexOf("CREATE SCHEMA"));
        expect(sql).toContain("CREATE TABLE public.orders");
        expect(sql).toContain("cms_integration_runtime.migration_ledger");
        expect(sql).toContain("cms integration fresh baseline conflict");
        expect(sql).toContain("checksum <> 'sha256:");
        expect(sql).toContain("expand-orders");
        expect(sql).toContain("cleanup-orders");
        expect(sql).toContain(`NULL, '${"d".repeat(64)}', 'fresh-install:attempt-1', NULL`);
        expect(sql.indexOf("CREATE TABLE public.orders")).toBeLessThan(
            sql.lastIndexOf("INSERT INTO cms_integration_runtime.migration_ledger"),
        );
    });

    test("guards exactly-once migration execution by id and checksum under the advisory lock", () => {
        const migration: LoadedSupabaseMigration = {
            id: "expand-orders",
            checksum: CHECKSUM_A,
            fromRevision: 1,
            toRevision: 2,
            introducedIn: "1.1.0",
            transaction: "atomic",
            phase: "expand",
            path: "migrations/0002-expand-orders.sql",
            sql: "ALTER TABLE public.orders ADD COLUMN revision bigint;",
        };
        const sql = buildSupabaseMigrationPhaseSql({
            integrationKind: "commerce",
            version: "1.1.0",
            provider: "supabase",
            migration: migrationDeployment(1),
            migrations: [migration],
            repeatables: [],
            attemptId: "attempt-2",
        });

        expect(sql).toContain("recorded_checksum IS NOT NULL");
        expect(sql).toContain("recorded_checksum IS NULL");
        expect(sql).toContain("EXECUTE $cms_migration_sql_");
        expect(sql).not.toContain("CREATE OR REPLACE PROCEDURE");
        expect(sql).toContain("migration checksum conflict");
        expect(sql).toContain("migration ledger is incomplete for current revision");
        expect(sql).toContain("GREATEST(migration_revision, 2)");
        expect(sql.indexOf("ALTER TABLE public.orders")).toBeLessThan(
            sql.indexOf("INSERT INTO cms_integration_runtime.migration_ledger"),
        );
        expect(sql.indexOf("INSERT INTO cms_integration_runtime.migration_ledger")).toBeLessThan(
            sql.lastIndexOf("COMMIT;"),
        );
        expect(sql).toContain("ADD COLUMN IF NOT EXISTS source_package_digest");
    });
});

function migrationDeployment(migrationRevision: number): IntegrationConnectorMigrationDeployment {
    return {
        connectorKey: "primary",
        lineageId: "commerce-supabase-v1",
        connectorInstanceId: "connector-instance-1",
        migrationRevision,
        plan: {
            install: {
                revision: 3,
                digest: CHECKSUM_A,
                coveredMigrations: [
                    { id: "expand-orders", checksum: CHECKSUM_A, revision: 2, introducedIn: "1.1.0" },
                    { id: "cleanup-orders", checksum: CHECKSUM_B, revision: 3, introducedIn: "1.1.0" },
                ],
            },
            migrations: [],
            supportedSources: [{ range: "^1.0.0", migrationRevision: 1 }],
            pointOfNoReturn: "before-contract",
        },
    };
}
