import { test, expect } from "bun:test";
import { MemoryTenantRegistry } from "src/default-implementation/MemoryTenantRegistry";
import { createRegistryIssuerTrust } from "src/core/tenant/issuerTrust";
import { ProvisioningError } from "src/core/errors";
import { makeClock } from "tests/helpers/clock";

const HUB = { iss: "https://hub.example", role: "control-plane" as const };

test("registry: upsert creates active, idempotent on tenantId", async () => {
    const r = new MemoryTenantRegistry();
    const a = await r.upsert({ tenantId: "t1", issuers: ["https://t1.example"] });
    expect(a.status).toBe("active"); expect(a.role).toBe("tenant");
    const b = await r.upsert({ tenantId: "t1", issuers: ["https://t1.example"], displayName: "T1" });
    expect(b.displayName).toBe("T1");
    expect(await r.resolveByIssuer("https://t1.example")).toMatchObject({ tenantId: "t1" });
    expect((await r.list()).length).toBe(1);
});

test("registry: conflicting issuer → ProvisioningError 409", async () => {
    const r = new MemoryTenantRegistry();
    await r.upsert({ tenantId: "t1", issuers: ["https://t1.example"] });
    try {
        await r.upsert({ tenantId: "t2", issuers: ["https://t1.example"] });
        throw new Error("should have thrown");
    } catch (e) {
        expect(e).toBeInstanceOf(ProvisioningError);
        expect((e as ProvisioningError).httpStatus).toBe(409);
    }
});

test("registry: patch rotates issuers + suspends; remove clears index", async () => {
    const r = new MemoryTenantRegistry();
    await r.upsert({ tenantId: "t1", issuers: ["https://old.example"] });
    await r.patch("t1", { issuers: ["https://new.example"], status: "suspended" });
    expect(await r.resolveByIssuer("https://old.example")).toBeNull();
    expect(await r.resolveByIssuer("https://new.example")).toMatchObject({ status: "suspended" });
    await r.remove("t1", { force: true });
    expect(await r.get("t1")).toBeNull();
    expect(await r.resolveByIssuer("https://new.example")).toBeNull();
});

test("registry: remove of unknown tenant is an idempotent no-op", async () => {
    const r = new MemoryTenantRegistry();
    await r.remove("ghost", { force: false });   // must not throw
    expect(await r.get("ghost")).toBeNull();
});

test("registry: list() is sorted by tenantId", async () => {
    const r = new MemoryTenantRegistry();
    await r.upsert({ tenantId: "t2", issuers: ["https://t2.example"] });
    await r.upsert({ tenantId: "t1", issuers: ["https://t1.example"] });
    expect((await r.list()).map((t) => t.tenantId)).toEqual(["t1", "t2"]);
});

test("state cache: clear() forces a reload", async () => {
    const r = new MemoryTenantRegistry();
    await r.upsert({ tenantId: "t1", issuers: ["https://t1.example"] });
    const c = makeClock(1000);
    const rit = createRegistryIssuerTrust({ allowlist: [HUB], registry: r, now: () => c.nowSec(), ttlSeconds: 999 });
    expect((await rit.resolve("https://t1.example"))!.tenant!.status).toBe("active");
    await r.patch("t1", { status: "suspended" });
    rit.cache.clear();
    expect((await rit.resolve("https://t1.example"))!.tenant!.status).toBe("suspended");
});

test("composite trust: static control-plane wins, registry resolves tenants", async () => {
    const r = new MemoryTenantRegistry();
    await r.upsert({ tenantId: "t1", issuers: ["https://t1.example"] });
    const c = makeClock(1000);
    const rit = createRegistryIssuerTrust({ allowlist: [HUB], registry: r, now: () => c.nowSec(), ttlSeconds: 10 });
    expect(await rit.resolve(HUB.iss)).toEqual({ role: "control-plane", tenant: null });
    expect(await rit.resolve("https://t1.example")).toMatchObject({ role: "tenant" });
    expect(await rit.resolve("https://unknown.example")).toBeNull();
    expect(await rit.trust.lookup(HUB.iss)).toEqual({ role: "control-plane" });
    expect(await rit.trust.lookup("https://unknown.example")).toBeNull();
});

test("bounded staleness: suspend effective within ≤ 1 TTL, invalidate is immediate", async () => {
    const r = new MemoryTenantRegistry();
    await r.upsert({ tenantId: "t1", issuers: ["https://t1.example"] });
    const c = makeClock(1000);
    const rit = createRegistryIssuerTrust({ allowlist: [HUB], registry: r, now: () => c.nowSec(), ttlSeconds: 10 });

    expect((await rit.resolve("https://t1.example"))!.tenant!.status).toBe("active");
    await r.patch("t1", { status: "suspended" });          // no explicit invalidate

    // still stale-active inside the TTL window (bounded staleness, accepted)
    c.advance(5);
    expect((await rit.resolve("https://t1.example"))!.tenant!.status).toBe("active");
    // past the TTL → fresh read sees suspended
    c.advance(6);
    expect((await rit.resolve("https://t1.example"))!.tenant!.status).toBe("suspended");

    // invalidate makes a change effective immediately
    await r.patch("t1", { status: "active" });
    rit.cache.invalidate("https://t1.example");
    expect((await rit.resolve("https://t1.example"))!.tenant!.status).toBe("active");
});
