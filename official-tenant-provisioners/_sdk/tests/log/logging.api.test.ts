import { test, expect } from "bun:test";
import adminLogs from "src/api/admin/logs.get";
import tenantLogs from "src/api/tenant/logs.get";
import { MemoryLogStore } from "src/default-implementation/MemoryLogStore";
import { createRecorder } from "src/core/log/recorder";
import { setRequestAuth, type RequestAuth } from "src/core/http/requestAuth";
import type { LogContext } from "src/types/SdkContext";
import type { TenantState } from "src/interfaces/TenantRegistry";

const now = () => 1_700_000_000;

async function seed(): Promise<LogContext> {
    const store = new MemoryLogStore();
    const rec = createRecorder({ providerId: "p", now, store });
    await rec.record({ kind: "request", level: "info", event: "request.served", tenantId: "t1", actor: "tenant", visibility: "both", sub: "u1", iss: "https://t1", ctx: { kid: "k1" } });
    await rec.record({ kind: "request", level: "info", event: "request.served", tenantId: "t2", actor: "tenant", visibility: "both" });
    makeSec(rec);
    await rec.record({ kind: "audit", level: "info", event: "tenant.provision", tenantId: "t1", actor: "control-plane", visibility: "control-plane" });
    return { store };
}
function makeSec(rec: ReturnType<typeof createRecorder>): void {
    void rec.record({ kind: "security", level: "warn", event: "auth.replay", tenantId: null, actor: "anonymous", visibility: "control-plane" });
}

const tenantAuth = (id: string): RequestAuth => ({
    claims: { iss: `https://${id}`, aud: "p", iat: 1, exp: 2, jti: "j" },
    role: "tenant", scope: "tenant",
    tenant: { tenantId: id, issuers: [`https://${id}`], role: "tenant", status: "active" } as TenantState,
});

test("admin /logs: control-plane sees everything raw (incl. security)", async () => {
    const ctx = await seed();
    const res = await adminLogs(new Request("http://x/admin/logs"), ctx);
    const body = await res.json();
    expect(body.items.length).toBe(4);
    expect(body.items.some((r: { kind: string }) => r.kind === "security")).toBe(true);
});

test("admin /logs: kind filter + bounded pagination", async () => {
    const ctx = await seed();
    const r1 = await adminLogs(new Request("http://x/admin/logs?kind=request"), ctx);
    expect((await r1.json()).items.every((r: { kind: string }) => r.kind === "request")).toBe(true);
    const r2 = await adminLogs(new Request("http://x/admin/logs?limit=1"), ctx);
    expect((await r2.json())).toHaveProperty("nextCursor");
});

test("tenant /logs: only own request logs, redacted; security/audit/other tenant excluded", async () => {
    const ctx = await seed();
    const req = new Request("http://x/tenant/logs");
    setRequestAuth(req, tenantAuth("t1"));
    const body = await (await tenantLogs(req, ctx)).json();
    expect(body.items.length).toBe(1);
    const it = body.items[0];
    expect(it).toMatchObject({ tenantId: "t1", kind: "request", sub: "u1" });
    expect("iss" in it).toBe(false);
    expect("ctx" in it).toBe(false);
});

test("tenant /logs: a tenantId query param is IGNORED (derived from token)", async () => {
    const ctx = await seed();
    const req = new Request("http://x/tenant/logs?tenantId=t2&kind=request");
    setRequestAuth(req, tenantAuth("t1"));
    const body = await (await tenantLogs(req, ctx)).json();
    expect(body.items.every((r: { tenantId: string }) => r.tenantId === "t1")).toBe(true);
    expect(body.items.length).toBe(1);
});
