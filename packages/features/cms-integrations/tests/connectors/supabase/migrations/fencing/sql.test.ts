import { describe, expect, test } from "bun:test";
import {
    buildSupabaseMigrationFenceRegistrationSql,
    buildSupabaseMigrationPhaseSql,
    buildSupabaseMigrationRuntimeSchemaSql,
    type LoadedSupabaseMigration,
    type LoadedSupabaseRepeatable,
} from "@bernouy/cms-integrations/supabase";
import { connectorDeployment, execution, SOURCE_PACKAGE_DIGEST, TARGET_PACKAGE_DIGEST } from "./fixture";

describe("Supabase database-local migration fencing", () => {
    test("checks a monotonic fence before and after provenance-bound writes", () => {
        const current = execution(7, "attempt-current");
        const registration = buildSupabaseMigrationFenceRegistrationSql({
            integrationKind: "commerce",
            migration: connectorDeployment(),
            execution: current,
        });
        const sql = buildSupabaseMigrationPhaseSql({
            integrationKind: "commerce",
            version: "1.1.0",
            provider: "supabase",
            migration: connectorDeployment(),
            migrations: [migration()],
            repeatables: [repeatable()],
            execution: current,
            finalizeTargetPackageDigest: true,
        });

        expect(registration).toContain("INSERT INTO cms_integration_runtime.migration_fences");
        expect(registration).toContain("migration_fences.fencing_token < EXCLUDED.fencing_token");
        expect(registration).toContain("migration_fences.target_package_digest = EXCLUDED.source_package_digest");
        expect(registration).toContain(`package_digest IS DISTINCT FROM '${SOURCE_PACKAGE_DIGEST}'`);
        expect(registration).toContain(`package_digest IS DISTINCT FROM '${TARGET_PACKAGE_DIGEST}'`);
        expect(registration).not.toContain("CREATE TABLE");
        expect(sql.match(/cms integration migration attempt was fenced/g)).toHaveLength(2);
        expect(sql).toContain("source_package_digest, target_package_digest, operation_id, fencing_token");
        expect(sql).toContain("INSERT INTO cms_integration_runtime.repeatable_ledger");
        expect(sql).toContain(`'${SOURCE_PACKAGE_DIGEST}', '${TARGET_PACKAGE_DIGEST}', 'operation-fenced', 7`);
        expect(sql).toContain(`package_digest = '${TARGET_PACKAGE_DIGEST}'`);
        expect(sql.indexOf("pg_advisory_xact_lock")).toBeLessThan(
            sql.indexOf("cms integration migration attempt was fenced"),
        );
        expect(sql.indexOf("cms integration migration attempt was fenced")).toBeLessThan(
            sql.indexOf("ALTER TABLE public.orders"),
        );
        expect(sql.lastIndexOf("cms integration migration attempt was fenced")).toBeGreaterThan(
            sql.indexOf(`package_digest = '${TARGET_PACKAGE_DIGEST}'`),
        );
    });

    test("upgrades legacy tables explicitly and rejects malformed provenance", () => {
        const schemaSql = buildSupabaseMigrationRuntimeSchemaSql();
        expect(schemaSql).toContain("pg_advisory_xact_lock");
        expect(schemaSql).toContain("cms-integration-runtime-schema-v1");
        expect(schemaSql).toContain("ALTER TABLE cms_integration_runtime.connector_instances");
        expect(schemaSql).toContain("ADD COLUMN IF NOT EXISTS package_digest");
        expect(schemaSql).toContain("CREATE TABLE IF NOT EXISTS cms_integration_runtime.migration_fences");
        expect(schemaSql.trim().endsWith("COMMIT;")).toBe(true);

        expect(() =>
            buildSupabaseMigrationFenceRegistrationSql({
                integrationKind: "commerce",
                migration: connectorDeployment(),
                execution: { ...execution(1, "attempt-1"), targetPackageDigest: "not-a-digest" },
            }),
        ).toThrow(/targetPackageDigest/);
    });
});

function migration(): LoadedSupabaseMigration {
    return {
        id: "expand-orders",
        checksum: `sha256:${"a".repeat(64)}`,
        fromRevision: 1,
        toRevision: 2,
        introducedIn: "1.1.0",
        transaction: "atomic",
        phase: "expand",
        path: "migrations/0002-expand-orders.sql",
        sql: "ALTER TABLE public.orders ADD COLUMN revision bigint;",
    };
}

function repeatable(): LoadedSupabaseRepeatable {
    return {
        id: "orders-view",
        checksum: `sha256:${"b".repeat(64)}`,
        path: "repeatables/orders-view.sql",
        sql: "CREATE OR REPLACE VIEW public.order_ids AS SELECT id FROM public.orders;",
    };
}
