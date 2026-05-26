import { test, expect } from "bun:test";
import type { Db } from "mongodb";
import { MemoryLogStore } from "@bernouy/tenant-provisioner-sdk";
import { makeCmsHooks, type CmsTenantRuntime, type CmsAdminOidc } from "../src/hooks";
import { CMS_TENANT_CONFIG } from "../src/tenantConfig";
import { createCmsProvider } from "../src/index";

const cfg = {
    oidcIssuer:        "https://kc.example/realms/shared",
    oidcClientId:      "cms-admin",
    oidcClientSecret:  "s3cr3t",
    initialAdminEmail: "boss@acme.com",
};

const oidc: CmsAdminOidc = {
    issuer: cfg.oidcIssuer, clientId: cfg.oidcClientId, clientSecret: cfg.oidcClientSecret,
};

/** Records the runtime calls so hook behaviour can be asserted. */
function spyRuntime() {
    const calls: { kind: string; tenantId: string; force?: boolean; oidc?: CmsAdminOidc; initialAdminEmail?: string }[] = [];
    const runtime: CmsTenantRuntime = {
        provision:   async ({ tenantId, oidc, initialAdminEmail }) => { calls.push({ kind: "provision", tenantId, oidc, initialAdminEmail }); },
        reprovision: async ({ tenantId, oidc, initialAdminEmail }) => { calls.push({ kind: "reprovision", tenantId, oidc, initialAdminEmail }); },
        deprovision: async ({ tenantId, force }) => { calls.push({ kind: "deprovision", tenantId, force }); },
    };
    return { calls, runtime };
}

test("tenantConfig: OIDC (authN) + initialAdminEmail, client secret write-only, zod parses", () => {
    const schema = CMS_TENANT_CONFIG.schema as {
        properties: Record<string, Record<string, unknown>>; defaultWritableBy: string[] };
    expect(Object.keys(schema.properties).sort())
        .toEqual(["initialAdminEmail", "oidcClientId", "oidcClientSecret", "oidcIssuer"]);
    expect(schema.defaultWritableBy).toEqual(["control-plane"]);
    expect(schema.properties.oidcClientSecret!["writeOnly"]).toBe(true);
    expect(CMS_TENANT_CONFIG.zod.parse(cfg)).toMatchObject(cfg);
});

test("hooks: provision/update mount via the runtime (oidc + initialAdminEmail); deprovision forwards force", async () => {
    const { calls, runtime } = spyRuntime();
    const hooks = makeCmsHooks({ runtime });

    await hooks.onProvision({ tenantId: "t1", issuers: [], displayName: "Acme", providerConfig: cfg });
    expect(calls[0]).toMatchObject({ kind: "provision", tenantId: "t1", oidc, initialAdminEmail: "boss@acme.com" });

    await hooks.onUpdate({ tenantId: "t1", patch: { providerConfig: { ...cfg, oidcClientSecret: "rotated" } } });
    expect(calls[1]).toMatchObject({ kind: "reprovision", tenantId: "t1" });
    expect(calls[1]!.oidc!.clientSecret).toBe("rotated");

    await hooks.onDeprovision({ tenantId: "t1", force: false });
    await hooks.onDeprovision({ tenantId: "t1", force: true });
    expect(calls.filter((c) => c.kind === "deprovision").map((c) => c.force)).toEqual([false, true]);
});

test("hooks: provision without config throws (admin OIDC + initialAdminEmail required)", async () => {
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
