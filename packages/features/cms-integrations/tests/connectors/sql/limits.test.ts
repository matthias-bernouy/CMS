import { describe, expect, test } from "bun:test";
import { loadSupabaseSqlBundle, SUPABASE_SQL_BUNDLE_LIMITS } from "@bernouy/cms-integrations/supabase";
import { createSqlRoot, writeManifest, writeSql } from "./sqlFixtures";

describe("Supabase SQL bundle limits", () => {
    test("limits recursive manifest depth", async () => {
        const root = await createSqlRoot();
        const last = SUPABASE_SQL_BUNDLE_LIMITS.maxDepth + 1;
        for (let index = 0; index <= last; index += 1) {
            await writeManifest(
                root,
                `manifest-${index}.json`,
                index === last ? [] : [{ manifest: `manifest-${index + 1}.json` }],
            );
        }

        await expect(loadSupabaseSqlBundle(root, "manifest-0.json")).rejects.toThrow(/depth exceeds/);
    });

    test("limits the total number of manifests and fragments", async () => {
        const root = await createSqlRoot();
        const entries = Array.from({ length: SUPABASE_SQL_BUNDLE_LIMITS.maxFiles }, (_, index) => ({
            file: `fragment-${index}.sql`,
        }));
        await Promise.all(entries.map(({ file }) => writeSql(root, file, "")));
        await writeManifest(root, "manifest.json", entries);

        await expect(loadSupabaseSqlBundle(root, "manifest.json")).rejects.toThrow(/exceeds 512 files/);
    });

    test("limits the aggregate byte size before assembly", async () => {
        const root = await createSqlRoot();
        await writeManifest(root, "manifest.json", [{ file: "large.sql" }]);
        await writeSql(root, "large.sql", "x".repeat(SUPABASE_SQL_BUNDLE_LIMITS.maxBytes));

        await expect(loadSupabaseSqlBundle(root, "manifest.json")).rejects.toThrow(/exceeds 8388608 bytes/);
    });
});
