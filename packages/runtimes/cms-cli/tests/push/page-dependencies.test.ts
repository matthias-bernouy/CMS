import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectPageDependencies, runIntegrationPageDependencies } from "cms-cli/push/pages/integrationDependencies";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";

const originalCwd = process.cwd();
const originalFetch = globalThis.fetch;

afterEach(() => {
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;
});

describe("integration page-link dependencies", () => {
    test("discovers repeatable page-link answers", () => {
        const definition: IntegrationDefinition = {
            kind: "legal",
            label: "Legal",
            inputs: [
                {
                    name: "documents",
                    label: "Documents",
                    type: "object-list",
                    fields: [{ name: "page", label: "Page", type: "page-link" }],
                },
            ],
            artifacts: [],
        };

        expect([
            ...collectPageDependencies(definition, { documents: [{ page: "/terms" }, { page: "/privacy" }] }),
        ]).toEqual(["/terms", "/privacy"]);
    });

    test("fails before integration when a referenced page is absent everywhere", async () => {
        const cwd = project();
        process.chdir(cwd);
        spyOn(globalThis, "fetch").mockResolvedValue(Response.json([]));
        const error = spyOn(console, "error").mockImplementation(() => {});

        const code = await runIntegrationPageDependencies(new URL("https://cms.test/"), "token", {
            force: false,
            yes: true,
            dryRun: false,
        });

        expect(code).toBe(1);
        expect(error).toHaveBeenCalledWith(expect.stringContaining('"/terms" is missing'));
        error.mockRestore();
    });

    test("prepublishes only referenced pages and leaves the complete site for the final stage", async () => {
        const cwd = project({ pages: true });
        process.chdir(cwd);
        let created = false;
        let remotePage: Record<string, unknown> = {};
        const writes: Array<{ method: string; body: Record<string, unknown> }> = [];
        spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
            const url = String(input);
            const method = init?.method ?? "GET";
            if (url.endsWith("/api/bloc/list")) {
                return Response.json([]);
            }
            if (url.endsWith("/api/page/list")) {
                return Response.json(created ? [{ id: "page-terms", path: "/terms" }] : []);
            }
            if (url.includes("/api/page?id=")) {
                return Response.json(remotePage);
            }
            if (url.endsWith("/api/page") && (method === "POST" || method === "PUT")) {
                const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
                writes.push({ method, body });
                created = true;
                if (method === "PUT") {
                    remotePage = body;
                }
                return new Response("ok");
            }
            return new Response("not found", { status: 404 });
        });
        const log = spyOn(console, "log").mockImplementation(() => {});
        const warn = spyOn(console, "warn").mockImplementation(() => {});

        const code = await runIntegrationPageDependencies(new URL("https://cms.test/"), "token", {
            force: false,
            yes: true,
            dryRun: false,
        });

        expect(code).toBe(0);
        expect(writes.map(({ method }) => method)).toEqual(["POST", "PUT"]);
        expect(writes[0]?.body.path).toBe("/terms");
        expect(writes.some(({ body }) => body.path === "/home")).toBe(false);
        log.mockRestore();
        warn.mockRestore();
    });

    test("rejects a remote-only draft dependency", async () => {
        const cwd = project();
        process.chdir(cwd);
        spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            const url = String(input);
            if (url.endsWith("/api/page/list")) {
                return Response.json([{ id: "draft", path: "/terms" }]);
            }
            if (url.includes("/api/page?id=")) {
                return Response.json({ title: "Terms", description: "", visible: false, tags: [], content: "Draft" });
            }
            return new Response("not found", { status: 404 });
        });
        const error = spyOn(console, "error").mockImplementation(() => {});
        const log = spyOn(console, "log").mockImplementation(() => {});

        expect(
            await runIntegrationPageDependencies(new URL("https://cms.test/"), "token", {
                force: false,
                yes: true,
                dryRun: false,
            }),
        ).toBe(1);
        expect(error).toHaveBeenCalledWith(expect.stringContaining("not published remotely"));
        error.mockRestore();
        log.mockRestore();
    });

    test("rejects a local-visible target when a remote conflict keeps the draft", async () => {
        const cwd = project({ pages: true, conflict: true });
        process.chdir(cwd);
        const writes: string[] = [];
        spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
            const url = String(input);
            const method = init?.method ?? "GET";
            if (url.endsWith("/api/bloc/list")) {
                return Response.json([]);
            }
            if (url.endsWith("/api/page/list")) {
                return Response.json([{ id: "draft", path: "/terms" }]);
            }
            if (url.includes("/api/page?id=")) {
                return Response.json({ title: "Terms", description: "", visible: false, tags: [], content: "Draft" });
            }
            writes.push(method);
            return new Response("ok");
        });
        const error = spyOn(console, "error").mockImplementation(() => {});
        const log = spyOn(console, "log").mockImplementation(() => {});

        expect(
            await runIntegrationPageDependencies(new URL("https://cms.test/"), "token", {
                force: false,
                yes: true,
                dryRun: false,
            }),
        ).toBe(1);
        expect(writes).toEqual([]);
        expect(error).toHaveBeenCalledWith(expect.stringContaining("not published remotely"));
        error.mockRestore();
        log.mockRestore();
    });
});

function project(options: { pages?: boolean; conflict?: boolean } = {}): string {
    const cwd = mkdtempSync(join(tmpdir(), "p9r-integration-pages-"));
    const site = join(cwd, "site");
    mkdirSync(join(site, "integrations"), { recursive: true });
    writeFileSync(join(cwd, "p9r.config.json"), JSON.stringify({ siteDir: "site" }));
    writeFileSync(
        join(site, "integrations", "legal.json"),
        JSON.stringify({
            kind: "legal",
            definition: {
                kind: "legal",
                label: "Legal",
                inputs: [
                    {
                        name: "documents",
                        label: "Documents",
                        type: "object-list",
                        fields: [{ name: "page", label: "Page", type: "page-link", required: true }],
                    },
                ],
                artifacts: [],
            },
            answers: { documents: [{ page: "/terms" }] },
        }),
    );
    if (options.pages) {
        mkdirSync(join(site, "pages"), { recursive: true });
        writeFileSync(join(site, "pages", "terms.html"), "---\nvisible: true\n---\n<p>Terms</p>");
        writeFileSync(join(site, "pages", "home.html"), "---\nvisible: true\n---\n<p>Home</p>");
    }
    if (options.conflict) {
        writeFileSync(
            join(site, ".p9r-state.json"),
            JSON.stringify({
                tenant: "",
                lastPulled: "",
                entities: { "page:/terms": { hash: "old", lastSeenRemote: "old" } },
            }),
        );
    }
    return cwd;
}
