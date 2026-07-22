import { describe, expect, test } from "bun:test";
import { loadSupabaseSqlSchemas, SUPABASE_SQL_BUNDLE_LIMITS } from "@bernouy/cms-integrations/supabase";
import { createSqlRoot, writeManifest, writeSql } from "./sqlFixtures";

describe("Supabase SQL schema loading", () => {
    test("preserves a legacy SQL file byte for byte", async () => {
        const root = await createSqlRoot();
        const sql = "create schema if not exists legacy;\n";
        await writeSql(root, "schema.sql", sql);

        expect(await loadSupabaseSqlSchemas(root, [{ path: "schema.sql" }])).toEqual([
            { id: "schema.sql", kind: "legacy", sql, sourceFiles: ["schema.sql"] },
        ]);
    });

    test("does not apply bundle byte limits to legacy SQL files", async () => {
        const root = await createSqlRoot();
        const sql = `-- ${"x".repeat(SUPABASE_SQL_BUNDLE_LIMITS.maxBytes)}\n`;
        await writeSql(root, "large-legacy.sql", sql);

        const [loaded] = await loadSupabaseSqlSchemas(root, [{ path: "large-legacy.sql" }]);

        expect(loaded?.sql).toBe(sql);
    });

    test("assembles an atomic bundle with source boundaries", async () => {
        const root = await createSqlRoot();
        await writeManifest(root, "sql/manifest.json", [
            { file: "foundation/extensions.sql" },
            { file: "catalog/tables.sql" },
        ]);
        await writeSql(root, "sql/foundation/extensions.sql", "create extension if not exists pgcrypto;\n");
        await writeSql(root, "sql/catalog/tables.sql", "create table catalog.items(id uuid);\n");

        const [bundle] = await loadSupabaseSqlSchemas(root, [{ manifest: "sql/manifest.json" }]);

        expect(bundle).toEqual({
            id: "sql/manifest.json",
            kind: "bundle",
            sourceFiles: ["foundation/extensions.sql", "catalog/tables.sql"],
            sql: [
                "BEGIN;",
                "-- cms-integration-sql-source: foundation/extensions.sql",
                "create extension if not exists pgcrypto;",
                "-- cms-integration-sql-source-end: foundation/extensions.sql",
                "-- cms-integration-sql-source: catalog/tables.sql",
                "create table catalog.items(id uuid);",
                "-- cms-integration-sql-source-end: catalog/tables.sql",
                "COMMIT;",
                "",
            ].join("\n"),
        });
    });

    test("resolves nested manifests in their declared order", async () => {
        const root = await createSqlRoot();
        await writeManifest(root, "sql/manifest.json", [
            { file: "first.sql" },
            { manifest: "nested/manifest.json" },
            { file: "last.sql" },
        ]);
        await writeManifest(root, "sql/nested/manifest.json", [{ file: "middle.sql" }]);
        await writeSql(root, "sql/first.sql", "select 'first';\n");
        await writeSql(root, "sql/nested/middle.sql", "select 'middle';\n");
        await writeSql(root, "sql/last.sql", "select 'last';\n");

        const [bundle] = await loadSupabaseSqlSchemas(root, [{ manifest: "sql/manifest.json" }]);

        expect(bundle?.sourceFiles).toEqual(["first.sql", "nested/middle.sql", "last.sql"]);
        expect(bundle?.sql.indexOf("'first'")).toBeLessThan(bundle?.sql.indexOf("'middle'") ?? -1);
        expect(bundle?.sql.indexOf("'middle'")).toBeLessThan(bundle?.sql.indexOf("'last'") ?? -1);
    });

    test("keeps SQL contents opaque", async () => {
        const root = await createSqlRoot();
        const fragment = "do $body$\nbegin\n  perform '; BEGIN COMMIT';\nend\n$body$;";
        await writeManifest(root, "sql/manifest.json", [{ file: "function.sql" }]);
        await writeSql(root, "sql/function.sql", fragment);

        const [bundle] = await loadSupabaseSqlSchemas(root, [{ manifest: "sql/manifest.json" }]);

        expect(bundle?.sql).toContain(`${fragment}\n-- cms-integration-sql-source-end`);
    });

    test("loads multiple independent schemas without changing their order", async () => {
        const root = await createSqlRoot();
        await writeSql(root, "legacy.sql", "select 'legacy';\n");
        await writeManifest(root, "sql/manifest.json", [{ file: "bundle.sql" }]);
        await writeSql(root, "sql/bundle.sql", "select 'bundle';\n");

        const loaded = await loadSupabaseSqlSchemas(root, [{ manifest: "sql/manifest.json" }, { path: "legacy.sql" }]);

        expect(loaded.map(({ id }) => id)).toEqual(["sql/manifest.json", "legacy.sql"]);
    });
});
