import { test, expect } from "bun:test";
import { join } from "node:path";
import { makeExample } from "@bernouy/tenant-provisioner-example";
import { examplePackageRoot } from "@bernouy/tenant-provisioner-example/constants";
import { MemoryLogStore } from "@bernouy/tenant-provisioner-sdk";
import { FakeIssuer } from "tests/helpers/fakeIssuer";
import { BunRunner } from "@bernouy/runner-bun";
import { serveForTest } from "@bernouy/runner-bun/testing";

const exampleSrc = join(examplePackageRoot, "src");

// Decoupling (_sdk.md): the example depends on the SDK and NOTHING else —
// re-checks the boundary guard at the consumer level.
const FORBIDDEN = ["@bernouy/cms", "@bernouy/core", "@bernouy/auth-core", "@bernouy/mt-cms-control"];

test("example imports ONLY @bernouy/tenant-provisioner-sdk (decoupling proof)", async () => {
    const offenders: string[] = [];
    for await (const f of new Bun.Glob("**/*.ts").scan({ cwd: exampleSrc })) {
        const txt = await Bun.file(join(exampleSrc, f)).text();
        for (const bad of FORBIDDEN) if (txt.includes(`"${bad}`)) offenders.push(`${f}: ${bad}`);
        for (const m of txt.matchAll(/from "([^"]+)"/g)) {
            const spec = m[1]!;
            if (spec.startsWith("@bernouy/") && spec !== "@bernouy/tenant-provisioner-sdk") {
                offenders.push(`${f}: ${spec}`);
            }
        }
    }
    expect(offenders).toEqual([]);
});

test("wiring is trivial — index.ts ≤ 20 non-trivial lines (ease metric)", async () => {
    const idx = await Bun.file(join(exampleSrc, "index.ts")).text();
    const code = idx.split("\n").map((l) => l.trim())
        .filter((l) => l && !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"));
    expect(code.length).toBeLessThanOrEqual(20);
});

test("/openapi.admin.json is the frozen §8 surface (identical for any provider)", async () => {
    const hub = await FakeIssuer.start();
    const runner = new BunRunner();
    try {
        const { provider } = makeExample(hub.iss, new MemoryLogStore());
        await provider.mount(runner);
        const srv = serveForTest(runner);
        const res = await srv.request("GET", "/openapi.admin.json",
            { headers: { Authorization: `Bearer ${await hub.mint({ aud: "notes-provider" })}` } });
        const spec = await res.json();
        expect(spec.openapi).toBe("3.0.3");
        expect(Object.keys(spec.paths).sort()).toEqual(["/admin/config", "/admin/info", "/admin/logs", "/admin/tenants"]);
        const ids = Object.values(spec.paths).flatMap((p) =>
            Object.values(p as Record<string, { operationId: string }>).map((o) => o.operationId)).sort();
        expect(ids).toEqual(["adminReadLogs", "adminReadTenantConfig", "deprovisionTenant", "listTenants", "provisionTenant", "tenantInfo", "updateTenant"]);
        expect(spec["x-tenant-provisioner"].defaultDeprovisionPolicy).toBeDefined();
    } finally { hub.stop(); runner.stop(); }
});
