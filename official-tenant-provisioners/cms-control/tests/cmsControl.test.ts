import { test, expect } from "bun:test";
import type { Db } from "mongodb";
import { MemoryLogStore } from "@bernouy/tenant-provisioner-sdk";
import { InMemoryCmsRepository } from "@bernouy/cms/repository";
import { makeCmsHooks } from "../src/hooks";
import { CMS_TENANT_CONFIG } from "../src/tenantConfig";
import { createCmsProvider } from "../src/index";

const cfg = { siteName: "Acme", host: "https://acme.com", language: "fr", theme: "body{}" };

test("tenantConfig: 4 control-plane-writable fields, widgets, zod parses", () => {
    const schema = CMS_TENANT_CONFIG.schema as {
        properties: Record<string, Record<string, unknown>>; defaultWritableBy: string[] };
    expect(Object.keys(schema.properties).sort()).toEqual(["host", "language", "siteName", "theme"]);
    expect(schema.defaultWritableBy).toEqual(["control-plane"]);
    expect(schema.properties.theme!["x-widget"]).toBe("textarea");
    expect(CMS_TENANT_CONFIG.zod.parse(cfg)).toMatchObject(cfg);
});

test("hooks: provision projects config → system.site; update re-applies; deprovision honors force", async () => {
    const repo = new InMemoryCmsRepository();
    let inited = false, dropped = false;
    const hooks = makeCmsHooks({
        repoFor:    () => repo,
        initTenant: async () => { inited = true; },
        dropTenant: async () => { dropped = true; },
    });

    await hooks.onProvision({ tenantId: "t1", issuers: [], providerConfig: cfg });
    expect(inited).toBe(true);
    let sys = await repo.getSystem();
    expect(sys.site).toMatchObject({ name: "Acme", host: "https://acme.com", language: "fr", theme: "body{}" });

    await hooks.onUpdate({ tenantId: "t1", patch: { providerConfig: { ...cfg, siteName: "Acme2" } } });
    sys = await repo.getSystem();
    expect(sys.site.name).toBe("Acme2");

    await hooks.onDeprovision({ tenantId: "t1", force: false });
    expect(dropped).toBe(false);
    await hooks.onDeprovision({ tenantId: "t1", force: true });
    expect(dropped).toBe(true);
});

test("hooks: provision without config lazy-creates the default system (no throw)", async () => {
    const repo = new InMemoryCmsRepository();
    const hooks = makeCmsHooks({ repoFor: () => repo, initTenant: async () => {}, dropTenant: async () => {} });
    await hooks.onProvision({ tenantId: "t1", issuers: [] });
    expect((await repo.getSystem()).site.name).toBe("");
});

test("createCmsProvider returns a mountable provider", () => {
    const provider = createCmsProvider({
        db: {} as Db, hubIssuer: "https://hub.example", logStore: new MemoryLogStore(),
    });
    expect(typeof provider.mount).toBe("function");
});
