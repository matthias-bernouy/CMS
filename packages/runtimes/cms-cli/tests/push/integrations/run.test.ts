import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runIntegrations } from "cms-cli/push/integrations/run";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";

const originalCwd = process.cwd();
const originalFetch = globalThis.fetch;

afterEach(() => {
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;
});

describe("runIntegrations", () => {
    test("loads catalogue dependencies and POSTs kind-only imports in dependency order", async () => {
        const cwd = makeProject({
            "a-consumer.json": { kind: "consumer", answers: {} },
            "z-root.json": { kind: "root", answers: {} },
        });
        process.chdir(cwd);

        const definitions: IntegrationDefinition[] = [
            {
                kind: "consumer",
                label: "Consumer",
                inputs: [],
                dependencies: [{ name: "base", kind: "root" }],
            },
            { kind: "root", label: "Root", inputs: [] },
        ];
        const posted: string[] = [];
        const calls: string[] = [];
        spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
            const url = String(input);
            calls.push(url);
            if (url.endsWith("/api/integrations/installations")) {
                return Response.json([]);
            }
            if (url.endsWith("/api/integrations/list")) {
                return Response.json(definitions);
            }
            if (url.endsWith("/api/integrations/import") && init?.method === "POST") {
                posted.push((JSON.parse(String(init.body)) as { kind: string }).kind);
                return Response.json({});
            }
            return new Response("not found", { status: 404 });
        });

        const code = await withQuietConsole(() =>
            runIntegrations(new URL("https://cms.example/"), "token", { force: false, yes: true, dryRun: false }),
        );

        expect(code).toBe(0);
        expect(calls).toContain("https://cms.example/api/integrations/list");
        expect(posted).toEqual(["root", "consumer"]);
    });
});

function makeProject(files: Record<string, unknown>): string {
    const cwd = mkdtempSync(join(tmpdir(), "p9r-integrations-run-"));
    const integrationsDir = join(cwd, "site", "integrations");
    mkdirSync(integrationsDir, { recursive: true });
    writeFileSync(
        join(cwd, "p9r.config.json"),
        JSON.stringify({
            siteDir: "site",
            forcePushDefault: false,
        }),
    );
    for (const [file, value] of Object.entries(files)) {
        writeFileSync(join(integrationsDir, file), JSON.stringify(value));
    }
    return cwd;
}

async function withQuietConsole<T>(run: () => Promise<T>): Promise<T> {
    const log = spyOn(console, "log").mockImplementation(() => {});
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
        return await run();
    } finally {
        log.mockRestore();
        error.mockRestore();
    }
}
