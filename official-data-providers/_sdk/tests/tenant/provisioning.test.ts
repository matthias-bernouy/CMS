import { test, expect } from "bun:test";
import { provisionTenant } from "src/core/provisioning/provisionTenant";
import { updateTenant } from "src/core/provisioning/updateTenant";
import { deprovisionTenant } from "src/core/provisioning/deprovisionTenant";
import { listTenants } from "src/core/provisioning/listTenants";
import { ProvisioningError } from "src/core/errors";
import { makeCtx, HUB_ISS } from "tests/helpers/provCtx";

const T = { tenantId: "t1", issuers: ["https://t1.example"] };

test("provision: creates active, idempotent, audited ok", async () => {
    const h = makeCtx();
    const s1 = await provisionTenant(h.ctx, HUB_ISS, T);
    expect(s1.status).toBe("active");
    await provisionTenant(h.ctx, HUB_ISS, { ...T, displayName: "T1" });
    expect(h.calls.provision).toBe(2);
    expect(h.invalidated).toContain(T.issuers[0]!);
    expect(h.audit.entries().filter((e) => e.result === "ok").length).toBe(2);
});

test("provision: conflicting issuer → 409, audited error, no hook", async () => {
    const h = makeCtx();
    await provisionTenant(h.ctx, HUB_ISS, T);
    h.calls.provision = 0;
    await expect(provisionTenant(h.ctx, HUB_ISS, { tenantId: "t2", issuers: T.issuers }))
        .rejects.toMatchObject({ httpStatus: 409 });
    expect(h.calls.provision).toBe(0);
    expect(h.audit.entries().some((e) => e.result === "error")).toBe(true);
});

test("provision: hook fails on fresh create → rollback + 502", async () => {
    const h = makeCtx({ onProvision: async () => { throw new Error("backend down"); } });
    await expect(provisionTenant(h.ctx, HUB_ISS, T)).rejects.toBeInstanceOf(ProvisioningError);
    expect(await h.registry.get("t1")).toBeNull();          // rolled back
    expect(h.audit.entries().some((e) => e.result === "error")).toBe(true);
});

test("provision: hook fails on pre-existing → NOT destroyed", async () => {
    const ok = makeCtx();
    await provisionTenant(ok.ctx, HUB_ISS, T);
    // reuse same registry/audit but a failing hook
    const ctx = { ...ok.ctx, hooks: { ...ok.ctx.hooks, onProvision: async () => { throw new Error("x"); } } };
    await expect(provisionTenant(ctx, HUB_ISS, T)).rejects.toBeInstanceOf(ProvisioningError);
    expect(await ok.registry.get("t1")).not.toBeNull();     // live tenant preserved
});

test("update: patch + invalidate(old,new) on issuer rotation; 404 unknown", async () => {
    const h = makeCtx();
    await provisionTenant(h.ctx, HUB_ISS, T);
    h.invalidated.length = 0;
    const s = await updateTenant(h.ctx, HUB_ISS, "t1", { issuers: ["https://t1b.example"], status: "suspended" });
    expect(s.status).toBe("suspended");
    expect(h.calls.update).toBe(1);
    expect(h.invalidated).toEqual(expect.arrayContaining([T.issuers[0], "https://t1b.example"]));
    await expect(updateTenant(h.ctx, HUB_ISS, "ghost", {})).rejects.toMatchObject({ httpStatus: 404 });
});

test("deprovision: hook(force) then unbind + invalidate + audit; hook fail keeps binding", async () => {
    const h = makeCtx();
    await provisionTenant(h.ctx, HUB_ISS, T);
    await deprovisionTenant(h.ctx, HUB_ISS, "t1", true);
    expect(h.calls.deprovision).toEqual([true]);
    expect(await h.registry.get("t1")).toBeNull();
    expect(h.invalidated).toContain(T.issuers[0]!);

    const h2 = makeCtx({ onDeprovision: async () => { throw new Error("purge boom"); } });
    await provisionTenant(h2.ctx, HUB_ISS, T);
    await expect(deprovisionTenant(h2.ctx, HUB_ISS, "t1", false)).rejects.toBeInstanceOf(ProvisioningError);
    expect(await h2.registry.get("t1")).not.toBeNull();     // kept for reconciliation
});

test("update: status-only patch invalidates only the current issuer", async () => {
    const h = makeCtx();
    await provisionTenant(h.ctx, HUB_ISS, T);
    h.invalidated.length = 0;
    await updateTenant(h.ctx, HUB_ISS, "t1", { status: "suspended" });
    expect(h.invalidated).toEqual([T.issuers[0]!]); // no second (no rotation)
});

test("update: onUpdate hook failure → 502", async () => {
    const h = makeCtx({ onUpdate: async () => { throw new Error("update boom"); } });
    await provisionTenant(h.ctx, HUB_ISS, T);
    await expect(updateTenant(h.ctx, HUB_ISS, "t1", { plan: "pro" }))
        .rejects.toMatchObject({ httpStatus: 502 });
});

test("list: reconciliation projection", async () => {
    const h = makeCtx();
    await provisionTenant(h.ctx, HUB_ISS, T);
    expect((await listTenants(h.ctx)).map((t) => t.tenantId)).toEqual(["t1"]);
});

// --- §11 providerConfig forwarding ----------------------------------------

test("provision: providerConfig forwarded opaquely to onProvision (§11)", async () => {
    const seen: unknown[] = [];
    const h = makeCtx({ onProvision: async (i) => { seen.push(i.providerConfig); } });
    const config = { carriers: ["mr"], countries: ["FR"] };
    await provisionTenant(h.ctx, HUB_ISS, { ...T, providerConfig: config });
    expect(seen).toEqual([config]);
});

test("provision: omitted providerConfig stays absent from hook payload", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const h = makeCtx({ onProvision: async (i) => { seen.push(i as unknown as Record<string, unknown>); } });
    await provisionTenant(h.ctx, HUB_ISS, T);
    expect(seen[0]).not.toHaveProperty("providerConfig");
});

test("update: providerConfig in patch reaches onUpdate (§11)", async () => {
    const seen: unknown[] = [];
    const h = makeCtx({ onUpdate: async (i) => { seen.push(i.patch.providerConfig); } });
    await provisionTenant(h.ctx, HUB_ISS, T);
    const cfg = { carriers: ["mr", "colissimo"] };
    await updateTenant(h.ctx, HUB_ISS, "t1", { providerConfig: cfg });
    expect(seen).toEqual([cfg]);
});

test("provision: provider validation throws inside hook → rollback + 502 (§11 D7)", async () => {
    const h = makeCtx({ onProvision: async () => { throw new Error("invalid providerConfig"); } });
    await expect(provisionTenant(h.ctx, HUB_ISS, { ...T, providerConfig: { bogus: true } }))
        .rejects.toBeInstanceOf(ProvisioningError);
    expect(await h.registry.get("t1")).toBeNull();      // rolled back
});
