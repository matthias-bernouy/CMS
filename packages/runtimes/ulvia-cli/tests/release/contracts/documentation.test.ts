import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readDocumentationSource } from "@bernouy/cms-repository/repository/authoring/build";

test("documentation source compilation derives paths, plain H1 titles and exact byte manifests", async () => {
    const root = await mkdtemp(join(tmpdir(), "documentation-source-"));
    try {
        await mkdir(join(root, "docs/pages"), { recursive: true });
        const content = "# **Create** a page\n\nUse the current schema.\n";
        await writeFile(join(root, "docs/pages/create.md"), content);
        const result = await readDocumentationSource(root);
        expect(result.documents).toMatchObject([
            { path: "pages/create.md", title: "Create a page", byteLength: Buffer.byteLength(content) },
        ]);
        expect(result.assets[0]?.id).toBe("docs/pages/create.md");
        expect(new TextDecoder().decode(result.assets[0]?.bytes)).toBe(content);
        await writeFile(join(root, "docs/pages/create.md"), "```md\n# Example\n```\n");
        await expect(readDocumentationSource(root)).rejects.toThrow("level-one Markdown heading");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("source scanning rejects root and nested symlinks before reading their contents", async () => {
    const root = await mkdtemp(join(tmpdir(), "documentation-symlink-"));
    try {
        expect((await readDocumentationSource(root)).documents).toEqual([]);
        await mkdir(join(root, "outside"));
        await writeFile(join(root, "outside/guide.md"), "# Outside\n");
        await symlink(join(root, "outside"), join(root, "docs"));
        await expect(readDocumentationSource(root)).rejects.toThrow("without symbolic links");
        await rm(join(root, "docs"));
        await mkdir(join(root, "docs"));
        await symlink(join(root, "outside/guide.md"), join(root, "docs/guide.md"));
        await expect(readDocumentationSource(root)).rejects.toThrow("symbolic links");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
