import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BAN_PROVIDER } from "@bernouy/cms-gateway/presets";
import type { Provider } from "@bernouy/cms-gateway";
import { scanGateways, canonicalGatewayHash, type LocalGateway } from "cms-cli/push/gateways/scan";
import { classifyGateways } from "cms-cli/push/gateways/classify";
import { flattenProvider } from "cms-cli/push/gateways/apply";
import { reconstructProvider } from "cms-cli/push/gateways/pull";
import type { PushState } from "cms-cli/push/shared/state";

/** Pass `{ "<file>.json": content }`; mirrors the on-disk `gateways/` layout. */
function makeSite(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "p9r-gw-"));
    mkdirSync(join(root, "gateways"));
    for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(root, "gateways", name), content);
    }
    return root;
}

const emptyState = (): PushState => ({ tenant: "", lastPulled: "", entities: {} });

const localGw = (urn: string, hash: string): LocalGateway => ({
    urn, slug: urn.replace("urn:", ""), file: `gateways/${urn.replace("urn:", "")}.json`,
    provider: { urn, meta: { name: "" }, endpoints: [] } as Provider, hash,
});

describe("scanGateways", () => {
    test("reads each gateways/*.json as a Provider keyed by urn", async () => {
        const dir = makeSite({ "ban.json": JSON.stringify(BAN_PROVIDER) });
        const gws = await scanGateways(dir);
        expect(gws.length).toBe(1);
        expect(gws[0]!.urn).toBe("urn:ban");
        expect(gws[0]!.slug).toBe("ban");
        expect(gws[0]!.provider.endpoints.length).toBe(BAN_PROVIDER.endpoints.length);
        expect(gws[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    test("returns [] when site/gateways/ is missing", async () => {
        const dir = mkdtempSync(join(tmpdir(), "p9r-gw-empty-"));
        expect(await scanGateways(dir)).toEqual([]);
    });

    test("rejects invalid JSON and a missing urn", async () => {
        await expect(scanGateways(makeSite({ "bad.json":   "{not json" }))).rejects.toThrow(/Invalid JSON/);
        await expect(scanGateways(makeSite({ "nourn.json": "{}"        }))).rejects.toThrow(/missing "urn"/);
    });
});

describe("canonicalGatewayHash", () => {
    test("changes when the provider changes", () => {
        const h = canonicalGatewayHash(BAN_PROVIDER);
        const mutated = { ...BAN_PROVIDER, meta: { ...BAN_PROVIDER.meta, name: "Changed" } } as Provider;
        expect(canonicalGatewayHash(mutated)).not.toBe(h);
    });
});

describe("classifyGateways", () => {
    test("new when urn absent remotely; unchanged when hash matches state; update otherwise", () => {
        const local = [localGw("urn:ban", "h1")];
        expect(classifyGateways(local, new Set(), emptyState(), false)[0]!.status).toBe("new");

        const state: PushState = {
            tenant: "", lastPulled: "",
            entities: { "gateway:urn:ban": { hash: "h1", lastSeenRemote: "h1" } },
        };
        expect(classifyGateways(local, new Set(["urn:ban"]), state, false)[0]!.status).toBe("unchanged");
        expect(classifyGateways([localGw("urn:ban", "h2")], new Set(["urn:ban"]), state, false)[0]!.status).toBe("update");
        // --force re-pushes even an unchanged provider.
        expect(classifyGateways(local, new Set(["urn:ban"]), state, true)[0]!.status).toBe("update");
    });
});

describe("flattenProvider", () => {
    test("emits the flat indexed form-body parseProviderDto expects, and never leaks a urn", () => {
        const flat = flattenProvider(BAN_PROVIDER);
        expect(flat.id).toBe("ban");
        expect(flat["meta.name"]).toBe("Base Adresse Nationale");
        expect(flat["endpoints.0.endpointId"]).toBe("search");
        expect(flat["endpoints.0.method"]).toBe("GET");
        expect(flat["endpoints.0.targetUrl"]).toBe("https://api-adresse.data.gouv.fr/search/");

        // params ships as ONE JSON-string blob, with `type` lifted out of `schema`.
        const params = JSON.parse(flat["endpoints.0.params"]!) as Array<Record<string, unknown>>;
        expect(params.find(p => p.name === "q")).toMatchObject({ name: "q", in: "query", type: "string", required: true });

        // urn is recomputed server-side from id + endpointId — must never be in the body.
        expect(Object.keys(flat).some(k => k.toLowerCase().includes("urn"))).toBe(false);
        expect(JSON.stringify(flat).includes("urn:ban")).toBe(false);
    });
});

describe("reconstructProvider (pull)", () => {
    test("rebuilds endpoint urns from id + endpointId and re-nests param type into schema", () => {
        const enriched = {
            urn:  "urn:ban",
            id:   "ban",
            meta: { name: "Base Adresse Nationale", description: "Géocodage", icon: "map-pin" },
            endpoints: [{
                endpointId: "search",
                method:     "GET",
                targetUrl:  "https://api-adresse.data.gouv.fr/search/",
                params: [
                    { name: "q",     in: "query", type: "string", required: true, description: "Adresse" },
                    { name: "limit", in: "query", type: "number", required: false },
                ],
                output: [{ status: "200" }],
            }],
        };
        const p = reconstructProvider(enriched);

        expect(p.urn).toBe("urn:ban");
        expect(p.meta?.name).toBe("Base Adresse Nationale");

        const e = p.endpoints[0]!;
        expect(e.urn).toBe("urn:ban:search");                     // rebuilt, method NOT in the urn
        expect(e.method).toBe("GET");
        expect(e.input?.params?.[0]).toEqual({ name: "q", in: "query", required: true, description: "Adresse", schema: { type: "string" } });
        expect(e.input?.params?.[1]).toEqual({ name: "limit", in: "query", schema: { type: "number" } }); // required:false → key omitted
        expect(e.output).toEqual([{ status: "200" }]);
    });
});
