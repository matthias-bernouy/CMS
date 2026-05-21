import { test, expect } from "bun:test";
import { join } from "node:path";
import { sdkPackageRoot } from "src/constants";
import { ADMIN_OPERATIONS } from "src/core/http/adminOperations";
import { setupMounted, cpToken, bearer } from "tests/helpers/mountSetup";

test("public endpoints need no auth", async () => {
    const s = await setupMounted();
    try {
        expect((await s.request("GET", "/health")).status).toBe(200);
        expect(await (await s.request("GET", "/openapi.json")).json()).toEqual({ x: 1 });
        expect(await (await s.request("GET", "/openapi.tenant.json")).json()).toEqual({ y: 2 });
        // §2.0 — data-provider-info is also public (no token).
        const info = await (await s.request("GET", "/.well-known/data-provider-info")).json();
        expect(info.providerId).toBe("prov-1");
        expect(info.contractVersion).toBe("1.0");
        expect(info.defaultDeprovisionPolicy).toBeDefined();
    } finally { s.stop(); }
});

test("§2.0 + D13: providerKind opt-in is exposed when declared", async () => {
    // setupMounted's config has no providerKind, so this builds a custom provider.
    const { FakeIssuer } = await import("tests/helpers/fakeIssuer");
    const { BunRunner } = await import("@bernouy/runner-bun");
    const { serveForTest } = await import("@bernouy/runner-bun/testing");
    const { createProvider } = await import("src/exports/createProvider");
    const { MemoryLogStore } = await import("src/default-implementation/MemoryLogStore");
    const hub = await FakeIssuer.start();
    const runner = new BunRunner();
    try {
        const provider = createProvider({
            config: { providerId: "p", providerKind: "delivery",
                      allowlist: [{ iss: hub.iss, role: "control-plane" }] },
            hooks:  { onProvision: async () => {}, onUpdate: async () => {}, onDeprovision: async () => {} },
            domain: { mount: () => {}, openapiConsumption: {}, openapiTenant: {} },
            store:  new MemoryLogStore(),
        });
        await provider.mount(runner);
        const srv = serveForTest(runner);
        const info = await (await srv.request("GET", "/.well-known/data-provider-info")).json();
        expect(info.providerKind).toBe("delivery");
    } finally { hub.stop(); runner.stop(); }
});

test("/openapi.admin.json is control-plane-gated, then generated from meta", async () => {
    const s = await setupMounted();
    try {
        const denied = await s.request("GET", "/openapi.admin.json");
        expect(denied.status).toBe(401);
        expect(denied.headers.get("Content-Type")).toBe("application/problem+json");

        const ok = await s.request("GET", "/openapi.admin.json", bearer(await cpToken(s.hub)));
        expect(ok.status).toBe(200);
        const spec = await ok.json();
        expect(spec.openapi).toBe("3.0.3");
        expect(Object.keys(spec.paths).sort()).toEqual(["/admin/config", "/admin/logs", "/admin/tenants"]);
        expect(spec["x-data-provider"].contractVersion).toBe("1.0");
    } finally { s.stop(); }
});

test("/openapi.tenant-config.json absent when no tenantConfig declared → 404", async () => {
    const s = await setupMounted();
    try {
        // setupMounted without tenantConfig — the runner has no route for it
        const res = await s.request("GET", "/openapi.tenant-config.json",
            bearer(await cpToken(s.hub)));
        expect(res.status).toBe(404);
    } finally { s.stop(); }
});

test("/openapi.tenant-config.json is control-plane-gated, then returns the schema", async () => {
    const { z } = await import("zod");
    const { MemoryTenantConfigStore } = await import("src/default-implementation/MemoryTenantConfigStore");
    const zodSchema = z.object({ allowEmoji: z.boolean().default(true) });
    const tenantConfig = {
        version: "1.0",
        schema: {
            type: "object",
            title: "demo config",
            defaultWritableBy: ["control-plane", "tenant"],
            properties: { allowEmoji: { type: "boolean", default: true } },
            required: [] as string[],
        },
        zod:     zodSchema,
        partial: zodSchema.partial(),
        store:   new MemoryTenantConfigStore(),
    };
    const s = await setupMounted({ tenantConfig });
    try {
        const noTok = await s.request("GET", "/openapi.tenant-config.json");
        expect(noTok.status).toBe(401);

        const ok = await s.request("GET", "/openapi.tenant-config.json",
            bearer(await cpToken(s.hub)));
        expect(ok.status).toBe(200);
        const body = await ok.json();
        expect(body["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
        expect(body["version"]).toBe("1.0");
        expect(body["properties"]).toEqual({ allowEmoji: { type: "boolean", default: true } });
    } finally { s.stop(); }
});

test("anti-drift: every api/admin/*.ts exports meta and is in ADMIN_OPERATIONS", async () => {
    const dir = join(sdkPackageRoot, "src", "api", "admin");
    const files: string[] = [];
    for await (const f of new Bun.Glob("*.ts").scan({ cwd: dir })) files.push(f);
    // each route file exports a `meta`
    for (const f of files) {
        const mod = await import(join(dir, f));
        expect(typeof mod.meta?.operationId).toBe("string");
    }
    const fromFiles = new Set(
        await Promise.all(files.map(async (f) => (await import(join(dir, f))).meta.operationId)),
    );
    const fromOps = new Set(ADMIN_OPERATIONS.map((o) => o.meta.operationId));
    expect(fromOps).toEqual(fromFiles);                    // no drift either way
});
