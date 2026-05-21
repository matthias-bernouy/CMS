import { test, expect } from "bun:test";
import { createRecorder } from "src/core/log/recorder";
import { MemoryLogStore } from "src/default-implementation/MemoryLogStore";
import { RecorderAuditSink } from "src/default-implementation/RecorderAuditSink";
import { makeSecurityLogger } from "src/core/log/securityAdapter";
import { redactForTenant } from "src/core/log/redaction";
import { stripSecrets } from "src/core/log/stripSecrets";
import { SdkError } from "src/core/errors";
import type { LogRecord } from "src/types/LogRecord";

const now = () => 1_700_000_000;
const mk = () => { const store = new MemoryLogStore(); return { store, rec: createRecorder({ providerId: "prov-1", now, store }) }; };

test("recorder: unknown event → throws synchronously (catalog enforced)", () => {
    const { rec } = mk();
    expect(() => rec.record({ kind: "request", level: "info", event: "nope", tenantId: "t1", actor: "tenant", visibility: "both" }))
        .toThrow(SdkError);
});

test("recorder: deny-list strips token/Authorization/JWT from ctx", async () => {
    const { store, rec } = mk();
    await rec.record({
        kind: "audit", level: "info", event: "tenant.provision",
        tenantId: "t1", actor: "control-plane", visibility: "control-plane",
        ctx: { Authorization: "Bearer x", nested: { jwt: "secret" }, who: "ok",
               raw: "eyJhbGci.payload.sig" },
    });
    const r = (await store.query({})).items[0]!;
    expect(r.ctx).toEqual({ Authorization: "[redacted]", nested: { jwt: "[redacted]" }, who: "ok", raw: "[redacted]" });
    expect(r.schemaVersion).toBe("1");
    expect(typeof r.requestId).toBe("string");
});

test("recorder: audit is durable (awaited), requestId preserved", async () => {
    const { store, rec } = mk();
    await rec.record({ kind: "audit", level: "info", event: "tenant.update",
        tenantId: "t1", actor: "control-plane", visibility: "control-plane", requestId: "req-9" });
    expect((await store.query({ kind: "audit" })).items[0]!.requestId).toBe("req-9");
});

test("stripSecrets: keys, JWT values, arrays, bounded depth", () => {
    expect(stripSecrets({ apiKey: "k", ok: 1 })).toEqual({ apiKey: "[redacted]", ok: 1 });
    expect(stripSecrets("eyJh.bbb.ccc")).toBe("[redacted]");
    expect(stripSecrets("plain")).toBe("plain");
    expect(stripSecrets(["plain", { token: "x" }])).toEqual(["plain", { token: "[redacted]" }]);
    expect(stripSecrets({ a: { b: { c: { d: { e: { f: 1 } } } } } }))
        .toEqual({ a: { b: { c: { d: { e: "[redacted]" } } } } });
});

test("recorder: request sampling (§10.4) keeps/drops best-effort", async () => {
    const s = new MemoryLogStore();
    const base = { kind: "request", level: "info", event: "request.served", tenantId: "t1", actor: "tenant", visibility: "both" } as const;
    await createRecorder({ providerId: "p", now, store: s, sampleRequest: () => false }).record({ ...base });
    expect((await s.query({})).items.length).toBe(0);
    await createRecorder({ providerId: "p", now, store: s, sampleRequest: () => true }).record({ ...base });
    expect((await s.query({})).items.length).toBe(1);
});

test("securityAdapter: maps reason → catalog event, control-plane visibility", async () => {
    const { store, rec } = mk();
    makeSecurityLogger(rec)("replay", { iss: "https://t1", jti: "j1" });
    makeSecurityLogger(rec)("totally-unknown-reason", {});      // → auth.unknown, no throw
    await Promise.resolve();
    const items = (await store.query({ kind: "security" })).items;
    expect(items.map((i) => i.event).sort()).toEqual(["auth.replay", "auth.unknown"]);
    expect(items.every((i) => i.visibility === "control-plane" && i.tenantId === null)).toBe(true);
});

test("RecorderAuditSink: AuditEvent → kind:audit record", async () => {
    const { store, rec } = mk();
    await new RecorderAuditSink(rec).record({
        ts: "ignored", callerIss: "https://hub", tenantId: "t1",
        operation: "deprovision", result: "ok", detail: "force",
    });
    const r = (await store.query({ kind: "audit" })).items[0]!;
    expect(r.event).toBe("tenant.deprovision");
    expect(r).toMatchObject({ outcome: "ok", iss: "https://hub", visibility: "control-plane" });
});

test("redactForTenant: safe by construction", () => {
    const base: LogRecord = {
        schemaVersion: "1", ts: "t", providerId: "p", requestId: "r",
        kind: "request", level: "info", event: "request.served",
        tenantId: "t1", actor: "tenant", visibility: "both",
        iss: "https://t1", sub: "opaque-1", ctx: { kid: "k1" },
    };
    expect(redactForTenant({ ...base, kind: "security", visibility: "control-plane" }, "t1")).toBeNull();
    expect(redactForTenant({ ...base, tenantId: "t2" }, "t1")).toBeNull();
    const red = redactForTenant(base, "t1")!;
    expect(red.sub).toBe("opaque-1");                 // own namespace kept
    expect("iss" in red).toBe(false);
    expect("ctx" in red).toBe(false);                 // internal stripped
});
