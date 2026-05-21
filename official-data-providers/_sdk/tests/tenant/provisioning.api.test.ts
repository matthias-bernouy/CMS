import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import postTenant from "src/api/admin/tenants.post";
import getTenants from "src/api/admin/tenants.get";
import { setRequestAuth, type RequestAuth } from "src/core/http/requestAuth";
import { ValidationError } from "src/core/errors";
import { MemoryAuditSink } from "src/default-implementation/MemoryAuditSink";
import { FileLogStore } from "src/default-implementation/FileLogStore";
import { makeCtx, HUB_ISS } from "tests/helpers/provCtx";

const auth: RequestAuth = {
    claims: { iss: HUB_ISS, aud: "prov-1", iat: 1, exp: 2, jti: "j1" },
    role: "control-plane", scope: "tenant", tenant: null,
};
function authed(method: string, body?: unknown): Request {
    const r = new Request("http://x/admin/tenants", {
        method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    setRequestAuth(r, auth);
    return r;
}

test("POST /admin/tenants handler → 200 JSON state", async () => {
    const h = makeCtx();
    const res = await postTenant(authed("POST", { tenantId: "t1", issuers: ["https://t1.example"] }), h.ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tenantId: "t1", status: "active" });
});

test("POST with invalid body → ValidationError (→ 400 via 06)", async () => {
    const h = makeCtx();
    await expect(postTenant(authed("POST", { issuer: "not-a-url" }), h.ctx))
        .rejects.toBeInstanceOf(ValidationError);
});

test("POST with malformed JSON body → ValidationError", async () => {
    const h = makeCtx();
    const r = new Request("http://x/admin/tenants", { method: "POST", body: "{not json" });
    setRequestAuth(r, auth);
    await expect(postTenant(r, h.ctx)).rejects.toBeInstanceOf(ValidationError);
});

test("GET /admin/tenants handler → { tenants }", async () => {
    const h = makeCtx();
    await postTenant(authed("POST", { tenantId: "t1", issuers: ["https://t1.example"] }), h.ctx);
    const res = await getTenants(new Request("http://x/admin/tenants"), h.ctx);
    expect(await res.json()).toEqual({ tenants: [expect.objectContaining({ tenantId: "t1" })] });
});

test("MemoryAuditSink is structurally immutable (copies out, no mutate API)", async () => {
    const a = new MemoryAuditSink();
    await a.record({ ts: "t", callerIss: HUB_ISS, tenantId: "t1", operation: "provision", result: "ok" });
    const snap = a.entries();
    (snap as { length: number }).length = 0;          // mutate the snapshot
    expect(a.entries().length).toBe(1);                // internal log untouched
    expect("update" in a).toBe(false);                 // no mutate/delete method
});

test("FileLogStore: durable append-only JSONL + filtered bounded query", async () => {
    const path = join(tmpdir(), `sdk-logs-${Date.now()}.jsonl`);
    try {
        const s = new FileLogStore(path);
        const base = { schemaVersion: "1", providerId: "p", requestId: "r", level: "info", actor: "control-plane", visibility: "control-plane" } as const;
        await s.append({ ...base, ts: "2024-01-01T00:00:00.000Z", kind: "audit", event: "tenant.provision", tenantId: "a" });
        await s.append({ ...base, ts: "2024-01-02T00:00:00.000Z", kind: "audit", event: "tenant.deprovision", tenantId: "b" });
        // survives a fresh instance (durable / persistent)
        const reopened = new FileLogStore(path);
        const all = await reopened.query({});
        expect(all.items.length).toBe(2);
        const onlyB = await reopened.query({ tenantId: "b" });
        expect(onlyB.items.map((r) => r.event)).toEqual(["tenant.deprovision"]);
        const lines = (await readFile(path, "utf8")).trim().split("\n");
        expect(lines.length).toBe(2);
    } finally { await rm(path, { force: true }); }
});
