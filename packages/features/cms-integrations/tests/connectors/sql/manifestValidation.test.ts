import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadSupabaseSqlBundle, loadSupabaseSqlSchemas } from "@bernouy/cms-integrations/supabase";
import { createSqlRoot, writeJson, writeManifest, writeSql } from "./sqlFixtures";

describe("Supabase SQL manifest validation", () => {
    test("rejects malformed JSON", async () => {
        const root = await createSqlRoot();
        await writeFile(join(root, "manifest.json"), "{not json");

        await expect(loadSupabaseSqlBundle(root, "manifest.json")).rejects.toThrow(
            /Invalid JSON in Supabase SQL manifest/,
        );
    });

    test("validates every manifest property strictly", async () => {
        const invalid = [
            {},
            { schema: "wrong", transaction: "atomic", entries: [] },
            { schema: "cms.integration.sql-bundle.v1", transaction: "partial", entries: [] },
            { schema: "cms.integration.sql-bundle.v1", transaction: "atomic", entries: {} },
            {
                schema: "cms.integration.sql-bundle.v1",
                transaction: "atomic",
                entries: [],
                extra: true,
            },
        ];
        for (const value of invalid) {
            const root = await createSqlRoot();
            await writeJson(root, "manifest.json", value);
            await expect(loadSupabaseSqlBundle(root, "manifest.json")).rejects.toThrow(/Invalid Supabase SQL manifest/);
        }
    });

    test("requires each entry to contain exactly one valid reference", async () => {
        const invalidEntries = [
            {},
            { file: "one.sql", manifest: "nested.json" },
            { file: "one.sql", extra: true },
            { file: "" },
            { manifest: " nested.json" },
        ];
        for (const entry of invalidEntries) {
            const root = await createSqlRoot();
            await writeJson(root, "manifest.json", {
                schema: "cms.integration.sql-bundle.v1",
                transaction: "atomic",
                entries: [entry],
            });
            await expect(loadSupabaseSqlBundle(root, "manifest.json")).rejects.toThrow(/Invalid Supabase SQL manifest/);
        }
    });

    test("rejects missing files and non-file references", async () => {
        const root = await createSqlRoot();
        await writeManifest(root, "missing.json", [{ file: "missing.sql" }]);
        await expect(loadSupabaseSqlBundle(root, "missing.json")).rejects.toThrow(/fragment was not found/);

        await mkdir(join(root, "directory.sql"));
        await writeManifest(root, "directory.json", [{ file: "directory.sql" }]);
        await expect(loadSupabaseSqlBundle(root, "directory.json")).rejects.toThrow(/is not a file/);
    });

    test("enforces JSON and SQL extensions", async () => {
        const root = await createSqlRoot();
        await writeSql(root, "fragment.txt", "select 1;\n");
        await writeManifest(root, "manifest.json", [{ file: "fragment.txt" }]);

        await expect(loadSupabaseSqlBundle(root, "manifest.json")).rejects.toThrow(/must use the .sql extension/);
        await expect(loadSupabaseSqlBundle(root, "manifest.txt")).rejects.toThrow(/must use the .json extension/);
    });

    test("validates deployment schema entries at runtime", async () => {
        const root = await createSqlRoot();
        await writeSql(root, "schema.sql", "select 1;\n");

        await expect(
            loadSupabaseSqlSchemas(root, [{ path: "schema.sql", manifest: "manifest.json" }] as never),
        ).rejects.toThrow(/exactly one path or manifest/);
        await expect(loadSupabaseSqlSchemas(root, [{ path: "schema.sql", extra: true }] as never)).rejects.toThrow(
            /exactly one path or manifest/,
        );
    });
});
