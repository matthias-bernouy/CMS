import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { discoverUiSources, isProductionSource } from "../source/files";

test("discovery follows browser helpers but excludes server-only code, tests and generated bundles", async () => {
    const root = await mkdtemp(join(tmpdir(), "ui-contract-discovery-"));
    async function file(path: string, content: string): Promise<void> {
        const absolute = join(root, path);
        await mkdir(dirname(absolute), { recursive: true });
        await writeFile(absolute, content);
    }
    try {
        const pkg = "packages/surfaces/cms-control";
        await file(`${pkg}/package.json`, JSON.stringify({ name: "@bernouy/cms-control" }));
        await file(`${pkg}/src/components/Admin.ts`, 'import { getData } from "cms-control/core/data"; getData();');
        await file(`${pkg}/src/core/data.ts`, 'export async function getData() { return fetch("/api/data"); }');
        await file(
            `${pkg}/src/core/server.ts`,
            'export async function server() { return fetch("https://provider.test"); }',
        );
        await file(`${pkg}/src/static/admin/example.html`, '<div cms-source="/api/data"></div>');
        await file(`${pkg}/tests/example.test.ts`, 'fetch("/api/test");');
        await file(`${pkg}/src/static/assets/control-components.js`, 'fetch("/compiled");');
        await file(`${pkg}/dist/index.js`, 'fetch("/generated");');
        const sources = await discoverUiSources(root);
        expect(sources.map((source) => source.path)).toHaveLength(4);
        expect(sources.find((source) => source.path.endsWith("/core/data.ts"))?.browser).toBe(true);
        expect(sources.find((source) => source.path.endsWith("/core/server.ts"))?.browser).toBe(false);
        expect(sources.find((source) => source.kind === "html")?.browser).toBe(true);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("production policy does not mistake declarations, fixtures or frozen package snapshots for UI sources", () => {
    for (const path of [
        "a/thing.d.ts",
        "a/thing.test.ts",
        "a/tests/helper.ts",
        "a/fixtures/page.html",
        "a/.registry/package/index.ts",
    ]) {
        expect(isProductionSource(path)).toBe(false);
    }
    expect(isProductionSource("packages/surfaces/cms-control/src/core/api.ts")).toBe(true);
});
