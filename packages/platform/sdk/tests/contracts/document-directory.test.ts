import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { defineFeature } from "@bernouy/ulvia-sdk";
import { compileContract } from "@bernouy/ulvia-sdk/build";
import { DOCUMENTATION_LIMITS } from "@bernouy/ulvia-contracts/documentation";
import { notesFeature } from "../../examples/notes";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "ulvia-sdk-docs-"));
    roots.push(root);
    const docs = join(root, "docs");
    await mkdir(docs);
    const url = pathToFileURL(`${docs}/`);
    return { root, docs, url, compile: () => compileContract({ ...notesFeature, documents: url }) };
}

test("recursive discovery uses relative paths, keeps exact bytes and matches in-memory admission", async () => {
    const f = await fixture();
    const documents = {
        "overview.md": "# Notes\r\n\r\n[SMTP](setup/overview.md)\r\n",
        "setup/overview.md": "# SMTP\n\nAccents: é. [Notes](../overview.md)\n",
    };
    await mkdir(join(f.docs, "setup"));
    for (const [path, text] of Object.entries(documents).reverse()) {
        await writeFile(join(f.docs, path), text);
    }
    await writeFile(join(f.docs, "ignored.txt"), "Not a document");
    const compiled = await f.compile();
    const memory = await compileContract({ ...notesFeature, documents });
    expect(compiled.canonicalJson).toBe(memory.canonicalJson);
    expect(compiled.digest).toBe(memory.digest);
    expect((await compileContract({ ...notesFeature, documents: new URL(f.url.href) })).digest).toBe(memory.digest);
    expect(compiled.release.documentation?.map((doc) => [doc.path, doc.title])).toEqual([
        ["overview.md", "Notes"],
        ["setup/overview.md", "SMTP"],
    ]);
    for (const asset of compiled.documentationAssets!) {
        const text = documents[asset.id.slice(5) as keyof typeof documents];
        expect(new Uint8Array(await asset.bytes.arrayBuffer())).toEqual(new TextEncoder().encode(text));
    }
});

test("definitions perform no filesystem IO; explicit missing or invalid directory URLs fail at build time", async () => {
    const f = await fixture();
    const source = defineFeature({ ...notesFeature, documents: pathToFileURL(join(f.root, "missing")) });
    await expect(compileContract(source)).rejects.toThrow();
    await writeFile(join(f.root, "file"), "# File");
    for (const documents of [
        pathToFileURL(join(f.root, "file")),
        new URL("https://example.com/docs/"),
        new URL(`${f.url}#fragment`),
    ]) {
        await expect(compileContract({ ...notesFeature, documents })).rejects.toThrow();
    }
    await expect(f.compile()).rejects.toThrow("documentation");
});

test("discovered Markdown retains title, path, UTF-8, link and operation-reference validation", async () => {
    const f = await fixture();
    for (const content of [
        "No heading",
        "# First\n# Second",
        "# Notes\n[Missing](missing.md)",
        new Uint8Array([0xff]),
    ]) {
        await writeFile(join(f.docs, "overview.md"), content);
        await expect(f.compile()).rejects.toThrow();
    }
    await writeFile(join(f.docs, "overview.md"), "# Notes");
    await writeFile(join(f.docs, "bad name.md"), "# Bad path");
    await expect(f.compile()).rejects.toThrow("path");
});

test("root, nested-directory and file symlinks are refused", async () => {
    const f = await fixture();
    await writeFile(join(f.docs, "overview.md"), "# Notes");
    await symlink(f.docs, join(f.root, "alias"));
    await expect(compileContract({ ...notesFeature, documents: pathToFileURL(join(f.root, "alias")) })).rejects.toThrow(
        "directories",
    );
    for (const target of [join(f.docs, "overview.md"), f.docs]) {
        await symlink(target, join(f.docs, "linked"));
        await expect(f.compile()).rejects.toThrow("symbolic links");
        await rm(join(f.docs, "linked"));
    }
});

test("discovery bounds document count and bytes before loading excessive content", async () => {
    const f = await fixture();
    const overview = join(f.docs, "overview.md");
    await writeFile(overview, "# Notes");
    await truncate(overview, DOCUMENTATION_LIMITS.documentBytes + 1);
    await expect(f.compile()).rejects.toThrow("byte limit");
    await writeFile(overview, "# Notes");
    for (let index = 0; index < DOCUMENTATION_LIMITS.documents; index++) {
        await writeFile(join(f.docs, `${index}.md`), "# Document");
    }
    await expect(f.compile()).rejects.toThrow("Too many");
});

test("discovery bounds total bytes, visited entries and directory depth", async () => {
    const f = await fixture();
    const content = "# Notes\n" + "x".repeat(DOCUMENTATION_LIMITS.documentBytes - 8);
    for (let index = 0; index < 33; index++) {
        await writeFile(join(f.docs, `${index}.md`), content);
    }
    await expect(f.compile()).rejects.toThrow("byte limit");
    await rm(f.docs, { recursive: true });
    await mkdir(f.docs);
    for (let index = 0; index < 1025; index++) {
        await writeFile(join(f.docs, `${index}.txt`), "");
    }
    await expect(f.compile()).rejects.toThrow("entry limit");
    await rm(f.docs, { recursive: true });
    await mkdir(join(f.docs, ...Array<string>(9).fill("nested")), { recursive: true });
    await expect(f.compile()).rejects.toThrow("depth limit");
});

test("directory content and URL are captured before asynchronous admission", async () => {
    const f = await fixture();
    const overview = join(f.docs, "overview.md");
    writeFileSync(overview, "# Notes\nOriginal");
    const before = await f.compile();
    const pending = f.compile();
    writeFileSync(overview, "# Notes\nChanged");
    f.url.pathname = join(f.root, "missing");
    expect((await pending).digest).toBe(before.digest);
    const after = await compileContract({ ...notesFeature, documents: pathToFileURL(f.docs) });
    expect(after.digest).not.toBe(before.digest);
});
