import { test, expect } from "bun:test";
import type { Db } from "mongodb";
import { MemoryLogStore } from "@bernouy/tenant-provisioner-sdk";
import { makeCmsHooks, type CmsTenantRuntime } from "../src/hooks";
import { CMS_TENANT_CONFIG } from "../src/tenantConfig";
import { createCmsProvider } from "../src/index";

const cfg = {
    initialAdminEmail: "boss@acme.com",
};

/** Records the runtime calls so hook behaviour can be asserted. */
function spyRuntime() {
    const calls: { kind: string; tenantId: string; force?: boolean; initialAdminEmail?: string }[] = [];
    const runtime: CmsTenantRuntime = {
        provision:   async ({ tenantId, initialAdminEmail }) => { calls.push({ kind: "provision", tenantId, initialAdminEmail }); },
        reprovision: async ({ tenantId, initialAdminEmail }) => { calls.push({ kind: "reprovision", tenantId, initialAdminEmail }); },
        deprovision: async ({ tenantId, force }) => { calls.push({ kind: "deprovision", tenantId, force }); },
    };
    return { calls, runtime };
}

test("tenantConfig: initialAdminEmail + optional initialAdminPassword, zod parses", () => {
    const schema = CMS_TENANT_CONFIG.schema as {
        properties: Record<string, Record<string, unknown>>; defaultWritableBy: string[] };
    expect(Object.keys(schema.properties).sort())
        .toEqual(["initialAdminEmail", "initialAdminPassword"]);
    expect(schema.defaultWritableBy).toEqual(["control-plane"]);
    expect(CMS_TENANT_CONFIG.zod.parse(cfg)).toMatchObject(cfg);
});

test("hooks: provision/update mount via the runtime (initialAdminEmail); deprovision forwards force", async () => {
    const { calls, runtime } = spyRuntime();
    const hooks = makeCmsHooks({ runtime });

    await hooks.onProvision({ tenantId: "t1", issuers: [], displayName: "Acme", providerConfig: cfg });
    expect(calls[0]).toMatchObject({ kind: "provision", tenantId: "t1", initialAdminEmail: "boss@acme.com" });

    await hooks.onUpdate({ tenantId: "t1", patch: { providerConfig: { initialAdminEmail: "new@acme.com" } } });
    expect(calls[1]).toMatchObject({ kind: "reprovision", tenantId: "t1", initialAdminEmail: "new@acme.com" });

    await hooks.onDeprovision({ tenantId: "t1", force: false });
    await hooks.onDeprovision({ tenantId: "t1", force: true });
    expect(calls.filter((c) => c.kind === "deprovision").map((c) => c.force)).toEqual([false, true]);
});

test("hooks: provision without config throws (initialAdminEmail required)", async () => {
    const { runtime } = spyRuntime();
    const hooks = makeCmsHooks({ runtime });
    await expect(hooks.onProvision({ tenantId: "t1", issuers: [] })).rejects.toThrow(/required/);
});

test("hooks: update without providerConfig is a no-op", async () => {
    const { calls, runtime } = spyRuntime();
    const hooks = makeCmsHooks({ runtime });
    await hooks.onUpdate({ tenantId: "t1", patch: {} });
    expect(calls).toHaveLength(0);
});

test("createCmsProvider returns a mountable provider", () => {
    const provider = createCmsProvider({
        db: {} as Db,
        hubIssuer: "https://hub.example",
        runtime: spyRuntime().runtime,
        logStore: new MemoryLogStore(),
    });
    expect(typeof provider.mount).toBe("function");
});
