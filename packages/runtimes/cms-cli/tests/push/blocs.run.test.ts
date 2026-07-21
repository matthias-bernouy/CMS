import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBlocs } from "cms-cli/push/blocs/run";

const originalCwd = process.cwd();
const originalFetch = globalThis.fetch;

afterEach(() => {
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;
});

describe("runBlocs", () => {
    test("uses p9r.config.json siteDir when scanning blocs", async () => {
        const { cwd } = makeProject({ siteDir: "custom-site" });
        process.chdir(cwd);
        const calls = mockBlocFetch([]);

        const code = await withQuietConsole(() =>
            runBlocs(new URL("http://cms.test/"), "token", { force: false, yes: true, dryRun: false }),
        );

        expect(code).toBe(0);
        const post = calls.find((c) => c.init?.method === "POST");
        expect(post).toBeDefined();
        const body = post!.init!.body as FormData;
        expect(body.get("tag")).toBe("demo-card");
        expect(String(body.get("source"))).toContain("manifest.json");
    });

    test("forcePushDefault overwrites an existing remote bloc without --force", async () => {
        const { cwd } = makeProject({ forcePushDefault: true });
        process.chdir(cwd);
        const calls = mockBlocFetch(["demo-card"]);

        const code = await withQuietConsole(() =>
            runBlocs(new URL("http://cms.test/"), "token", { force: false, yes: true, dryRun: false }),
        );

        expect(code).toBe(0);
        const post = calls.find((c) => c.init?.method === "POST");
        expect(post).toBeDefined();
        expect((post!.init!.body as FormData).get("force")).toBe("true");
    });

    test("dry-run builds and reports without uploading", async () => {
        const { cwd } = makeProject({});
        process.chdir(cwd);
        const calls = mockBlocFetch([]);

        const code = await withQuietConsole(() =>
            runBlocs(new URL("http://cms.test/"), "token", { force: false, yes: false, dryRun: true }),
        );

        expect(code).toBe(0);
        expect(calls.some((c) => c.init?.method === "POST")).toBe(false);
    });
});

describe("CLI_push bloc stage wiring", () => {
    test("uses the normal blocs stage instead of the legacy import implementation", () => {
        const source = readFileSync(new URL("../../src/CLI_push.ts", import.meta.url), "utf-8");

        expect(source).toMatch(/import\s*\{\s*runBlocs\s*\}\s*from\s*["']\.\/push\/blocs\/run["']\s*;/);
        expect(source).toMatch(
            /case\s+["']blocs["']\s*:\s*return\s+runBlocs\s*\(\s*adminBase\s*,\s*token\s*,\s*flags\s*\)\s*;/,
        );
        expect(source).not.toMatch(/\bCLI_importBloc\b/);
    });
});

function makeProject(opts: { siteDir?: string; forcePushDefault?: boolean }) {
    const cwd = mkdtempSync(join(tmpdir(), "p9r-blocs-run-"));
    const siteDir = opts.siteDir ?? "site";
    writeFileSync(
        join(cwd, "p9r.config.json"),
        JSON.stringify({
            siteDir,
            forcePushDefault: opts.forcePushDefault === true,
        }),
    );

    const blocDir = join(cwd, siteDir, "blocs", "Content", "demo-card");
    mkdirSync(blocDir, { recursive: true });
    writeFileSync(
        join(blocDir, "manifest.json"),
        JSON.stringify({
            "default-tag": "demo-card",
            meta: {
                title: "Demo card",
                description: "A demo bloc",
            },
        }),
    );
    writeFileSync(
        join(blocDir, "Bloc.ts"),
        `
export class DemoCard extends HTMLElement {
    connectedCallback() { this.textContent = "Demo"; }
}
`,
    );

    return { cwd };
}

function mockBlocFetch(remoteTags: string[]) {
    const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input, init });
        const url = String(input);
        if (url.endsWith("/api/bloc/list")) {
            return Response.json(remoteTags.map((id) => ({ id })));
        }
        if (init?.method === "POST") {
            return new Response("ok");
        }
        return new Response("not found", { status: 404 });
    });
    return calls;
}

async function withQuietConsole<T>(fn: () => Promise<T>): Promise<T> {
    const log = spyOn(console, "log").mockImplementation(() => {});
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
        return await fn();
    } finally {
        log.mockRestore();
        warn.mockRestore();
        error.mockRestore();
    }
}
