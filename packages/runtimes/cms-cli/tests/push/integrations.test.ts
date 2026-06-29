import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    scanIntegrations,
    canonicalIntegrationHash,
    type LocalIntegration,
    type LocalIntegrationImport,
} from "cms-cli/push/integrations/scan";
import { classifyIntegrations } from "cms-cli/push/integrations/classify";
import { reconstructSource } from "cms-cli/push/integrations/pull";
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
