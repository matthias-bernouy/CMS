import { describe, expect, test } from "bun:test";
import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadSupabaseSqlBundle } from "@bernouy/cms-integrations/supabase";
import { createSqlRoot, writeManifest, writeSql } from "./sqlFixtures";

describe("Supabase SQL bundle security", () => {
    test("rejects traversal, absolute, backslash, and control-character paths", async () => {
        const references = [
            "../outside.sql",
            "/tmp/outside.sql",
            "C:/outside.sql",
            "nested\\outside.sql",
            "line\nbreak.sql",
        ];
        for (const reference of references) {
            const root = await createSqlRoot();
            await writeManifest(root, "manifest.json", [{ file: reference }]);
            await expect(loadSupabaseSqlBundle(root, "manifest.json")).rejects.toThrow(/Invalid Supabase SQL path/);
        }
    });

    test("rejects manifest traversal before reading it", async () => {
        const root = await createSqlRoot();
        await writeManifest(root, "manifest.json", [{ manifest: "../nested.json" }]);

        await expect(loadSupabaseSqlBundle(root, "manifest.json")).rejects.toThrow(/Invalid Supabase SQL path/);
    });

    test("detects direct and indirect manifest cycles with their chain", async () => {
        const directRoot = await createSqlRoot();
        await writeManifest(directRoot, "manifest.json", [{ manifest: "manifest.json" }]);
        await expect(loadSupabaseSqlBundle(directRoot, "manifest.json")).rejects.toThrow(
            /manifest.json -> manifest.json/,
        );

        const indirectRoot = await createSqlRoot();
        await writeManifest(indirectRoot, "manifest.json", [{ manifest: "nested/a.json" }]);
        await writeManifest(indirectRoot, "nested/a.json", [{ manifest: "b.json" }]);
        await writeManifest(indirectRoot, "nested/b.json", [{ manifest: "a.json" }]);
        await expect(loadSupabaseSqlBundle(indirectRoot, "manifest.json")).rejects.toThrow(
            /nested\/a.json -> nested\/b.json -> nested\/a.json/,
        );
    });

    test("rejects duplicate fragments by canonical path", async () => {
        const root = await createSqlRoot();
        await writeSql(root, "sql/shared.sql", "select 1;\n");
        await symlink("shared.sql", join(root, "sql", "alias.sql"));
        await writeManifest(root, "sql/manifest.json", [{ file: "shared.sql" }, { file: "alias.sql" }]);

        await expect(loadSupabaseSqlBundle(root, "sql/manifest.json")).rejects.toThrow(/included more than once/);
    });

    test("rejects fragment symlinks outside the connector root", async () => {
        const root = await createSqlRoot();
        const outside = await createSqlRoot();
        await writeFile(join(outside, "outside.sql"), "select current_user;\n");
        await symlink(join(outside, "outside.sql"), join(root, "outside.sql"));
        await writeManifest(root, "manifest.json", [{ file: "outside.sql" }]);

        await expect(loadSupabaseSqlBundle(root, "manifest.json")).rejects.toThrow(/escapes Supabase connector root/);
    });

    test("rejects nested manifest symlinks outside the connector root", async () => {
        const root = await createSqlRoot();
        const outside = await createSqlRoot();
        await writeManifest(outside, "nested.json", []);
        await symlink(join(outside, "nested.json"), join(root, "nested.json"));
        await writeManifest(root, "manifest.json", [{ manifest: "nested.json" }]);

        await expect(loadSupabaseSqlBundle(root, "manifest.json")).rejects.toThrow(/escapes Supabase connector root/);
    });

    test("confines fragments to the root manifest directory", async () => {
        const root = await createSqlRoot();
        await writeSql(root, "outside.sql", "select 'outside';\n");
        await writeManifest(root, "sql/manifest.json", [{ file: "linked.sql" }]);
        await symlink(join(root, "outside.sql"), join(root, "sql", "linked.sql"));

        await expect(loadSupabaseSqlBundle(root, "sql/manifest.json")).rejects.toThrow(/escapes bundle root/);
    });

    test("rejects a root manifest symlink outside the connector", async () => {
        const root = await createSqlRoot();
        const outside = await createSqlRoot();
        await writeManifest(outside, "manifest.json", []);
        await symlink(join(outside, "manifest.json"), join(root, "manifest.json"));

        await expect(loadSupabaseSqlBundle(root, "manifest.json")).rejects.toThrow(/escapes Supabase connector root/);
    });
});
