import { afterEach, describe, expect, spyOn, test } from "bun:test";
import type { SiteBlocDefinition } from "@bernouy/cms-content";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pullBlocs } from "cms-cli/push/blocs/pull";
import { runBlocs } from "cms-cli/push/blocs/run";
import { generateSiteBlocSource } from "cms-cli/push/blocs/siteBuilder";

const originalCwd = process.cwd();
const originalFetch = globalThis.fetch;

afterEach(() => {
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;
});

describe("site-builder bloc synchronization", () => {
    test("pulls builder.json and regenerates trusted sources before a builder-aware push", async () => {
        const { cwd, siteDir } = project();
        const definition = divergentDefinition();
        const remoteSource = generateSiteBlocSource(definition);
        const calls = mockRemote(definition, remoteSource);

        const pulled = await pullBlocs(new URL("http://cms.test/"), "token", siteDir);
        expect(pulled).toEqual({ pulled: [definition.tag], skipped: [], failed: [] });
        const folder = join(siteDir, "blocs", "Layout", definition.tag);
        const builderBefore = readFileSync(join(folder, "builder.json"), "utf-8");
        expect(builderBefore).toContain('"schema": "cms.site-bloc.v1"');
        writeFileSync(join(folder, "Bloc.ts"), 'throw new Error("untrusted stale source");\n');
        process.chdir(cwd);

        const code = await withQuietConsole(() =>
            runBlocs(new URL("http://cms.test/"), "token", {
                force: true,
                yes: true,
                dryRun: false,
            }),
        );

        expect(code).toBe(0);
        const post = calls.find((call) => call.init?.method === "POST");
        expect(String(post?.input)).toBe("http://cms.test/api/bloc/site-builder");
        const form = post!.init!.body as FormData;
        expect(form.get("definition")).toBe(builderBefore);
        expect(form.get("name")).toBe("Draft shell");
        expect(form.get("group")).toBe("Draft layouts");
        const pushedSource = JSON.parse(String(form.get("source"))) as Record<string, string>;
        expect(Object.keys(pushedSource).sort()).toEqual([
            "BlocEditor.ts",
            "builder.json",
            "default.html",
            "manifest.json",
            "template.html",
        ]);
        expect(pushedSource["Bloc.ts"]).toBeUndefined();
        expect(Buffer.from(pushedSource["manifest.json"]!, "base64").toString("utf-8")).toContain(
            '"composition": "./template.html"',
        );
        const manifest = JSON.parse(Buffer.from(pushedSource["manifest.json"]!, "base64").toString("utf-8"));
        expect(manifest.meta.title).toBe("Draft shell");
        expect(Buffer.from(pushedSource["default.html"]!, "base64").toString("utf-8")).toContain("Draft-only content");
    });

    test("refuses a remote ownership mismatch even with force", async () => {
        const { cwd, siteDir } = project();
        const definition = publishedDefinition();
        const folder = join(siteDir, "blocs", "Layout", definition.tag);
        mkdirSync(folder, { recursive: true });
        const source = generateSiteBlocSource(definition);
        for (const [path, base64] of Object.entries(source)) {
            writeFileSync(join(folder, path), Buffer.from(base64, "base64"));
        }
        process.chdir(cwd);
        const posts: string[] = [];
        spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
            if (init?.method === "POST") {
                posts.push(String(input));
                return new Response("ok");
            }
            return Response.json([{ id: definition.tag, ownership: { kind: "code-managed" } }]);
        });

        const code = await withQuietConsole(() =>
            runBlocs(new URL("http://cms.test/"), "token", {
                force: true,
                yes: true,
                dryRun: false,
            }),
        );

        expect(code).toBe(1);
        expect(posts).toEqual([]);
    });

    test("pull refuses to replace a local site-builder folder owned by a different remote definition", async () => {
        const { siteDir } = project();
        const definition = publishedDefinition();
        const folder = join(siteDir, "blocs", "Layout", definition.tag);
        mkdirSync(folder, { recursive: true });
        for (const [path, base64] of Object.entries(generateSiteBlocSource(definition))) {
            writeFileSync(join(folder, path), Buffer.from(base64, "base64"));
        }
        const marker = join(folder, "local-only.txt");
        writeFileSync(marker, "must survive");
        spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            const url = String(input);
            if (url.endsWith("/api/bloc/list")) {
                return Response.json([{ id: definition.tag, group: "Layout", ownership: { kind: "code-managed" } }]);
            }
            if (url.includes("/api/bloc/source")) {
                return Response.json({
                    source: {
                        "manifest.json": Buffer.from('{"default-tag":"site-shell"}\n', "utf-8").toString("base64"),
                    },
                });
            }
            return new Response("not found", { status: 404 });
        });

        const result = await pullBlocs(new URL("http://cms.test/"), "token", siteDir);

        expect(result.pulled).toEqual([]);
        expect(result.failed).toHaveLength(1);
        expect(result.failed[0]?.error).toContain("owned by another definition");
        expect(readFileSync(marker, "utf-8")).toBe("must survive");
        expect(readFileSync(join(folder, "builder.json"), "utf-8")).toContain(definition.id);
    });
});

function project(): { cwd: string; siteDir: string } {
    const cwd = mkdtempSync(join(tmpdir(), "p9r-site-builder-"));
    const siteDir = join(cwd, "site");
    writeFileSync(join(cwd, "p9r.config.json"), JSON.stringify({ siteDir: "site" }));
    return { cwd, siteDir };
}

function mockRemote(definition: SiteBlocDefinition, source: Record<string, string>) {
    const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        calls.push({ input, init });
        const url = String(input);
        if (url.endsWith("/api/bloc/list")) {
            return Response.json([{ id: definition.tag, group: "Layout", ownership: definition.ownership }]);
        }
        if (url.includes("/api/bloc/source")) {
            return Response.json({ source });
        }
        if (init?.method === "POST") {
            return new Response("ok");
        }
        return new Response("not found", { status: 404 });
    });
    return calls;
}

function publishedDefinition(): SiteBlocDefinition {
    const snapshot = {
        name: "Site shell",
        group: "Layout",
        description: "Site-owned shell",
        structure: [{ kind: "slot" as const, slotId: "content" }],
        slots: [
            {
                id: "content",
                label: "Content",
                accepts: [{ kind: "any-component" as const }],
            },
        ],
        defaultContent: "<p>Default content</p>",
        dependencies: [],
    };
    return {
        schema: "cms.site-bloc.v1",
        id: "definition-site-shell",
        tag: "site-shell",
        ownership: { kind: "site-builder", definitionId: "definition-site-shell" },
        lifecycle: "active",
        draftRevision: 1,
        publishedRevision: 1,
        draft: snapshot,
        published: snapshot,
        createdAt: new Date("2026-07-27T10:00:00.000Z"),
        updatedAt: new Date("2026-07-27T10:00:00.000Z"),
    };
}

function divergentDefinition(): SiteBlocDefinition {
    const definition = publishedDefinition();
    return {
        ...definition,
        draftRevision: 2,
        draft: {
            ...definition.draft,
            name: "Draft shell",
            group: "Draft layouts",
            description: "Unpublished local changes",
            defaultContent: "<p>Draft-only content</p>",
        },
    };
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
