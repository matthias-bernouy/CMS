import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    scanIntegrations,
    canonicalIntegrationHash,
    type LocalIntegration,
    type LocalIntegrationImport,
} from "cms-cli/push/integrations/scan";
import { classifyIntegrations } from "cms-cli/push/integrations/classify";
import { pullIntegrations, reconstructSource } from "cms-cli/push/integrations/pull";
import { pullBlocs } from "cms-cli/push/blocs/pull";
import type { PushState } from "cms-cli/push/shared/state";

/** Pass `{ "<file>.json": content }`; mirrors the on-disk `integrations/` layout. */
function makeSite(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "p9r-int-"));
    mkdirSync(join(root, "integrations"));
    for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(root, "integrations", name), content);
    }
    return root;
}

const emptyState = (): PushState => ({ tenant: "", lastPulled: "", entities: {} });

const localIntegration = (id: string, hash: string): LocalIntegration => ({
    id,
    slug: id.replace(/[^a-z0-9]+/gi, "-"),
    file: `integrations/${id.replace(/[^a-z0-9]+/gi, "-")}.json`,
    request: manualSourceImport("test"),
    hash,
});

const SOURCE_URL = "https://api.example.com/items";

const MANUAL_SOURCE_DEFINITION = {
    kind: "manual-source",
    label: "Manual source",
    inputs: [
        { name: "id", label: "Source id", type: "text", required: true },
        { name: "targetUrl", label: "Target URL", type: "url", required: true },
    ],
    artifacts: [{
        type: "source",
        source: {
            id: "{{answers.id}}",
            meta: { name: "Manual source" },
            endpoints: [{ endpointId: "list", method: "GET", targetUrl: "{{answers.targetUrl}}", params: [] }],
        },
    }],
} satisfies NonNullable<LocalIntegrationImport["definition"]>;

function manualSourceImport(id = "shop", targetUrl = SOURCE_URL): LocalIntegrationImport {
    return {
        kind: "manual-source",
        definition: MANUAL_SOURCE_DEFINITION,
        answers: { id, targetUrl },
    };
}

describe("scanIntegrations", () => {
    test("reads each integrations/*.json as an integration import", async () => {
        const dir = makeSite({ "shop.json": JSON.stringify(manualSourceImport()) });
        const entries = await scanIntegrations(dir);

        expect(entries.length).toBe(1);
        expect(entries[0]!.id).toBe("manual-source:shop");
        expect(entries[0]!.slug).toBe("shop");
        expect(entries[0]!.file).toBe("integrations/shop.json");
        expect(entries[0]!.request.kind).toBe("manual-source");
        expect(entries[0]!.request.definition?.kind).toBe("manual-source");
        expect(entries[0]!.request.instance).toBeUndefined();
        expect(entries[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    test("returns [] when site/integrations/ is missing", async () => {
        const dir = mkdtempSync(join(tmpdir(), "p9r-int-empty-"));
        expect(await scanIntegrations(dir)).toEqual([]);
    });

    test("rejects invalid JSON and missing integration fields", async () => {
        await expect(scanIntegrations(makeSite({ "bad.json": "{not json" }))).rejects.toThrow(/Invalid integration/);
        await expect(scanIntegrations(makeSite({ "nokind.json": JSON.stringify({ answers: {} }) }))).rejects.toThrow(/missing "kind"/);
        await expect(scanIntegrations(makeSite({ "noanswers.json": JSON.stringify({ kind: "manual-source" }) }))).rejects.toThrow(/missing "answers" object/);
    });
});

describe("canonicalIntegrationHash", () => {
    test("changes when the integration import changes", () => {
        const h = canonicalIntegrationHash(manualSourceImport());
        expect(canonicalIntegrationHash(manualSourceImport("shop", "https://api.example.com/changed"))).not.toBe(h);
    });
});

describe("classifyIntegrations", () => {
    test("new when id absent remotely; unchanged when hash matches state; update otherwise", () => {
        const local = [localIntegration("manual-source:test", "h1")];
        expect(classifyIntegrations(local, new Set(), emptyState(), false)[0]!.status).toBe("new");

        const state: PushState = {
            tenant: "", lastPulled: "",
            entities: { "integration:manual-source:test": { hash: "h1", lastSeenRemote: "h1" } },
        };
        expect(classifyIntegrations(local, new Set(["manual-source:test"]), state, false)[0]!.status).toBe("unchanged");
        expect(classifyIntegrations([localIntegration("manual-source:test", "h2")], new Set(["manual-source:test"]), state, false)[0]!.status).toBe("update");
        // --force re-pushes even an unchanged integration import.
        expect(classifyIntegrations(local, new Set(["manual-source:test"]), state, true)[0]!.status).toBe("update");
    });
});

describe("reconstructSource (pull)", () => {
    test("rebuilds endpoint urns from id + endpointId and re-nests param type into schema", () => {
        const enriched = {
            urn:  "urn:test",
            id:   "test",
            meta: { name: "Test Source", description: "Test data", icon: "database" },
            endpoints: [{
                endpointId: "list",
                method:     "GET",
                targetUrl:  "https://api.example.com/items",
                params: [
                    { name: "q",     in: "query", type: "string", required: true, description: "Search query" },
                    { name: "limit", in: "query", type: "number", required: false },
                ],
                output: [{ status: "200" }],
            }],
        };
        const p = reconstructSource(enriched);

        expect(p.urn).toBe("urn:test");
        expect(p.meta?.name).toBe("Test Source");

        const e = p.endpoints[0]!;
        expect(e.urn).toBe("urn:test:list");                     // rebuilt, method NOT in the urn
        expect(e.method).toBe("GET");
        expect(e.input?.params?.[0]).toEqual({ name: "q", in: "query", required: true, description: "Search query", schema: { type: "string" } });
        expect(e.input?.params?.[1]).toEqual({ name: "limit", in: "query", schema: { type: "number" } }); // required:false → key omitted
        expect(e.output).toEqual([{ status: "200" }]);
    });
});

describe("pullIntegrations", () => {
    test("writes generated bloc artifacts under .p9r/generated/blocs", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-int-pull-"));
        const source = {
            "manifest.json": encode(JSON.stringify({
                "default-tag": "demo-card",
                bloc: "./Bloc.ts",
                meta: { title: "Demo card" },
            })),
            "Bloc.ts": encode("export class DemoCard extends HTMLElement {}\n"),
        };

        await withFetch(async (url) => {
            if (url.endsWith("/api/integrations/instances")) return Response.json([{ id: "demo:main" }]);
            if (url.includes("/api/integrations/instances?id=demo%3Amain")) {
                return Response.json({
                    id: "demo:main",
                    kind: "demo",
                    label: "Demo",
                    definitionVersion: "1",
                    status: "success",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                    runCount: 1,
                    answers: { id: "main" },
                    artifacts: [{ type: "bloc", id: "demo-card", action: "created" }],
                    runs: [],
                });
            }
            if (url.endsWith("/api/bloc/list")) return Response.json([{ id: "demo-card", group: "Generated" }]);
            if (url.includes("/api/bloc/source?tag=demo-card")) return Response.json({ source });
            return new Response("not found", { status: 404 });
        }, async () => {
            const result = await pullIntegrations(new URL("http://cms.test/"), "token", siteDir);

            expect(result).toEqual({ pulled: ["demo:main"], failed: [] });
            expect(JSON.parse(readFileSync(join(siteDir, "integrations", "demo-main.json"), "utf-8"))).toMatchObject({
                kind: "demo",
                answers: { id: "main" },
            });
            expect(readFileSync(join(siteDir, ".p9r", "generated", "blocs", "Generated", "demo-card", "manifest.json"), "utf-8"))
                .toContain(`"default-tag":"demo-card"`);
        });
    });
});

describe("pullBlocs", () => {
    test("skips blocs already owned by generated integration artifacts", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-bloc-pull-"));
        mkdirSync(join(siteDir, ".p9r", "generated"), { recursive: true });
        writeFileSync(join(siteDir, ".p9r", "generated", "integration-instances.json"), JSON.stringify([{
            id: "demo:main",
            kind: "demo",
            artifacts: [{ type: "bloc", id: "demo-card", action: "created" }],
        }]));

        await withFetch(async (url) => {
            if (url.endsWith("/api/bloc/list")) return Response.json([{ id: "demo-card", group: "Generated" }]);
            if (url.includes("/api/bloc/source")) throw new Error("generated bloc source should not be fetched by pullBlocs");
            return new Response("not found", { status: 404 });
        }, async () => {
            const result = await pullBlocs(new URL("http://cms.test/"), "token", siteDir);

            expect(result.pulled).toEqual([]);
            expect(result.failed).toEqual([]);
            expect(result.skipped).toEqual([{
                tag: "demo-card",
                reason: "generated by an integration; use `p9r pull --type=integrations`",
            }]);
        });
    });
});

function encode(value: string): string {
    return Buffer.from(value, "utf-8").toString("base64");
}

async function withFetch(
    handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
    run: () => Promise<void>,
): Promise<void> {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
    try {
        await run();
    } finally {
        globalThis.fetch = originalFetch;
    }
}
