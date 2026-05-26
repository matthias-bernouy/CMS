import { test, expect } from "bun:test";
import { makeExample } from "@bernouy/tenant-provisioner-example";
import { MemoryLogStore } from "@bernouy/tenant-provisioner-sdk";
import { FakeIssuer } from "tests/helpers/fakeIssuer";
import { BunRunner } from "@bernouy/runner-bun";
import { serveForTest } from "@bernouy/runner-bun/testing";

/**
 * End-to-end verification of base.md §11 — through the reference provider
 * (`_example/`). Covers: discovery endpoint gating, provision with
 * providerConfig, tenant-scope self-service GET/PATCH /tenant/config,
 * x-writable-by enforcement, writeOnly filtering, user-scope refusal.
 */

const bear = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } });

async function setup() {
    const hub  = await FakeIssuer.start();
    const tIss = await FakeIssuer.start();
    const { provider } = makeExample(hub.iss, new MemoryLogStore());
    const r = new BunRunner();
    await provider.mount(r);
    const srv = serveForTest(r);
    return { request: srv.request, hub, tIss, stop: () => { srv.stop(); hub.stop(); tIss.stop(); } };
}

const cp = (hub: FakeIssuer) => hub.mint({ aud: "notes-provider" });
const t  = (i: FakeIssuer, sub?: string) =>
    i.mint({ aud: "notes-provider", ...(sub ? { sub } : {}) });

test("§11.2: /openapi.tenant-config.json is CP-gated and returns the schema", async () => {
    const s = await setup();
    try {
        expect((await s.request("GET", "/openapi.tenant-config.json")).status).toBe(401);

        const tres = await s.request("GET", "/openapi.tenant-config.json",
            bear(await t(s.tIss)));
        expect(tres.status).toBe(401);          // not provisioned + verify rejects

        // Provision so tenant token resolves
        await s.request("POST", "/admin/tenants", {
            ...bear(await cp(s.hub)),
            body: JSON.stringify({ tenantId: "t1", issuers: [s.tIss.iss] }),
        });
        // Tenant trying to read the SCHEMA → forbidden (CP-only)
        expect((await s.request("GET", "/openapi.tenant-config.json",
            bear(await t(s.tIss)))).status).toBe(403);

        // CP can read it
        const ok = await s.request("GET", "/openapi.tenant-config.json",
            bear(await cp(s.hub)));
        expect(ok.status).toBe(200);
        const spec = await ok.json();
        expect(spec.version).toBe("1.0");
        expect(spec.properties.maxNotes.type).toBe("integer");
        expect(spec.properties.secretApiKey.writeOnly).toBe(true);
    } finally { s.stop(); }
});

test("§11.3: provision with providerConfig persists into the provider store", async () => {
    const s = await setup();
    try {
        const res = await s.request("POST", "/admin/tenants", {
            ...bear(await cp(s.hub)),
            body: JSON.stringify({
                tenantId: "t1", issuers: [s.tIss.iss],
                providerConfig: { maxNotes: 42, allowEmoji: false, secretApiKey: "sk-hub-42" },
            }),
        });
        expect(res.status).toBe(200);

        // Read back via tenant — writeOnly stripped
        const cfgRes = await s.request("GET", "/tenant/config", bear(await t(s.tIss)));
        const body = await cfgRes.json();
        expect(body.version).toBe("1.0");
        expect(body.config).toEqual({ maxNotes: 42, allowEmoji: false });   // no secretApiKey
    } finally { s.stop(); }
});

test("§11.3: GET /admin/config returns full config including writeOnly (CP sees all)", async () => {
    const s = await setup();
    try {
        await s.request("POST", "/admin/tenants", {
            ...bear(await cp(s.hub)),
            body: JSON.stringify({
                tenantId: "t1", issuers: [s.tIss.iss],
                providerConfig: { maxNotes: 42, allowEmoji: false, secretApiKey: "sk-hub-42" },
            }),
        });
        const res = await s.request("GET", "/admin/config?tenantId=t1",
            bear(await cp(s.hub)));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.version).toBe("1.0");
        // CP sees the writeOnly field as well
        expect(body.config).toEqual({ maxNotes: 42, allowEmoji: false, secretApiKey: "sk-hub-42" });
    } finally { s.stop(); }
});

test("§11.3: GET /admin/config returns 404 for unknown tenant", async () => {
    const s = await setup();
    try {
        const res = await s.request("GET", "/admin/config?tenantId=ghost",
            bear(await cp(s.hub)));
        expect(res.status).toBe(404);
    } finally { s.stop(); }
});

test("§11.3: GET /admin/config is CP-gated (tenant token → 403)", async () => {
    const s = await setup();
    try {
        await s.request("POST", "/admin/tenants", {
            ...bear(await cp(s.hub)),
            body: JSON.stringify({ tenantId: "t1", issuers: [s.tIss.iss] }),
        });
        const res = await s.request("GET", "/admin/config?tenantId=t1",
            bear(await t(s.tIss)));
        expect(res.status).toBe(403);
    } finally { s.stop(); }
});

test("§11.4: tenant can PATCH /tenant/config for fields with x-writable-by ⊇ [tenant]", async () => {
    const s = await setup();
    try {
        await s.request("POST", "/admin/tenants", {
            ...bear(await cp(s.hub)),
            body: JSON.stringify({ tenantId: "t1", issuers: [s.tIss.iss] }),
        });
        const res = await s.request("PATCH", "/tenant/config", {
            ...bear(await t(s.tIss)),
            body: JSON.stringify({ maxNotes: 5 }),
        });
        expect(res.status).toBe(200);
        expect((await res.json()).config.maxNotes).toBe(5);
    } finally { s.stop(); }
});

test("§11.4: tenant cannot PATCH a hub-only field → 403 (plane)", async () => {
    const s = await setup();
    try {
        await s.request("POST", "/admin/tenants", {
            ...bear(await cp(s.hub)),
            body: JSON.stringify({ tenantId: "t1", issuers: [s.tIss.iss] }),
        });
        const res = await s.request("PATCH", "/tenant/config", {
            ...bear(await t(s.tIss)),
            body: JSON.stringify({ secretApiKey: "stolen" }),
        });
        expect(res.status).toBe(403);
        expect(res.headers.get("Content-Type")).toBe("application/problem+json");
    } finally { s.stop(); }
});

test("§11.4 / D10: user-scope (sub) cannot edit config → 401", async () => {
    const s = await setup();
    try {
        await s.request("POST", "/admin/tenants", {
            ...bear(await cp(s.hub)),
            body: JSON.stringify({ tenantId: "t1", issuers: [s.tIss.iss] }),
        });
        const res = await s.request("PATCH", "/tenant/config", {
            ...bear(await t(s.tIss, "user-99")),                  // sub present → user scope
            body: JSON.stringify({ maxNotes: 7 }),
        });
        expect(res.status).toBe(401);
    } finally { s.stop(); }
});

test("§11: hub PATCH /admin/tenants providerConfig reaches onUpdate → persisted", async () => {
    const s = await setup();
    try {
        await s.request("POST", "/admin/tenants", {
            ...bear(await cp(s.hub)),
            body: JSON.stringify({ tenantId: "t1", issuers: [s.tIss.iss] }),
        });
        const upd = await s.request("PATCH", "/admin/tenants?tenantId=t1", {
            ...bear(await cp(s.hub)),
            body: JSON.stringify({ providerConfig: { maxNotes: 99, allowEmoji: true } }),
        });
        expect(upd.status).toBe(200);

        const cfg = await (await s.request("GET", "/tenant/config",
            bear(await t(s.tIss)))).json();
        expect(cfg.config.maxNotes).toBe(99);
    } finally { s.stop(); }
});

test("§11: invalid providerConfig at provision → 400 (SDK validates BEFORE hook)", async () => {
    const s = await setup();
    try {
        const res = await s.request("POST", "/admin/tenants", {
            ...bear(await cp(s.hub)),
            body: JSON.stringify({
                tenantId: "t1", issuers: [s.tIss.iss],
                providerConfig: { maxNotes: 9999 },                // > max 100
            }),
        });
        expect(res.status).toBe(400);
        // No upsert happened — registry untouched (validation runs before upsert).
        const list = await (await s.request("GET", "/admin/tenants",
            bear(await cp(s.hub)))).json();
        expect(list.tenants).toEqual([]);
    } finally { s.stop(); }
});
