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
        const pkg = "packages/surfaces/cms-edge";
        await file(`${pkg}/package.json`, JSON.stringify({ name: "@bernouy/cms-edge" }));
        await file(`${pkg}/src/components/Admin.ts`, 'import { getData } from "cms-edge/core/data"; getData();');
        await file(`${pkg}/src/core/data.ts`, 'export async function getData() { return fetch("/api/data"); }');
        await file(
            `${pkg}/src/core/server.ts`,
            'export async function server() { return fetch("https://provider.test"); }',
        );
        await file(
            `${pkg}/src/core/admin/auth/templates/example.html`,
            '<form cms-mutation="catalog:save as saved"></form>',
        );
        await file(`${pkg}/tests/example.test.ts`, 'fetch("/api/test");');
        await file(`${pkg}/src/browser/admin-runtime.js`, 'fetch("/compiled");');
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

test("discovery audits authored official collection blocs and their browser helpers", async () => {
    const root = await mkdtemp(join(tmpdir(), "ui-contract-official-"));
    async function file(path: string, content: string): Promise<void> {
        const absolute = join(root, path);
        await mkdir(dirname(absolute), { recursive: true });
        await writeFile(absolute, content);
    }
    try {
        const bloc = "packages/official-repository/collections/official/blocs/admin/example";
        await file(`${bloc}/bloc.ts`, 'import { load } from "./runtime/client"; load();');
        await file(`${bloc}/runtime/client.ts`, 'export const load = () => fetch("/.cms/call/example/list");');
        await file(`${bloc}/markup.html`, "<section></section>");

        const sources = await discoverUiSources(root);

        expect(sources.map(({ path }) => path)).toEqual([
            `${bloc}/bloc.ts`,
            `${bloc}/markup.html`,
            `${bloc}/runtime/client.ts`,
        ]);
        expect(sources.every(({ browser }) => browser)).toBe(true);
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
    expect(isProductionSource("packages/surfaces/cms-edge/src/core/api.ts")).toBe(true);
});
