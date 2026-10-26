import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanJsonSourceTree } from "@bernouy/cms-repository/repository/authoring";

test("shared source traversal preserves exclusions and rejects links, non-JSON files and excessive depth", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-source-tree-"));
    try {
        await writeFile(join(root, "definition.json"), "{}");
        await mkdir(join(root, "nested"));
        await writeFile(join(root, "nested", "item.json"), "{}");
        expect(
            (await scanJsonSourceTree(root, new Set(["definition.json"]))).map(({ relativePath }) => relativePath),
        ).toEqual(["nested/item.json"]);
        await symlink(join(root, "definition.json"), join(root, "link.json"));
        await expect(scanJsonSourceTree(root)).rejects.toThrow("Unsupported");
        await rm(join(root, "link.json"));
        await writeFile(join(root, "invalid.txt"), "text");
        await expect(scanJsonSourceTree(root)).rejects.toThrow("Unsupported");
        await rm(join(root, "invalid.txt"));
        await mkdir(join(root, ...Array(17).fill("deep")), { recursive: true });
        await expect(scanJsonSourceTree(root)).rejects.toThrow("directory levels");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
