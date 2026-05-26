import { test, expect } from "bun:test";
import { MemoryLogStore } from "@bernouy/tenant-provisioner-sdk";
import { KeycloakClientError } from "@bernouy/keycloak-client";
import { makeKeycloakHooks, type KeycloakRealmAdmin } from "../src/hooks";
import { KEYCLOAK_TENANT_CONFIG } from "../src/tenantConfig";
import { createKeycloakProvider, realmIssuerUrl } from "../src/index";

class FakeKeycloak implements KeycloakRealmAdmin {
    created: string[] = [];
    updates: Array<{ realm: string; patch: { displayName?: string; enabled?: boolean } }> = [];
    deleted: string[] = [];
    conflictOnCreate = false;
    async createRealm(input: { realm: string; displayName?: string }): Promise<void> {
        if (this.conflictOnCreate) throw new KeycloakClientError("conflict", "exists", 409);
        this.created.push(input.realm);
    }
    async updateRealm(realm: string, patch: { displayName?: string; enabled?: boolean }): Promise<void> {
        this.updates.push({ realm, patch });
    }
    async deleteRealm(realm: string): Promise<void> { this.deleted.push(realm); }
}

test("tenantConfig: displayName + enabled, control-plane-writable", () => {
    const schema = KEYCLOAK_TENANT_CONFIG.schema as {
        properties: Record<string, Record<string, unknown>>; defaultWritableBy: string[] };
    expect(Object.keys(schema.properties).sort()).toEqual(["displayName", "enabled"]);
    expect(schema.defaultWritableBy).toEqual(["control-plane"]);
    expect(KEYCLOAK_TENANT_CONFIG.zod.parse({})).toEqual({ displayName: "", enabled: true });
});

test("realmIssuerUrl derives the convention URL (trailing slash tolerated)", () => {
    expect(realmIssuerUrl("https://kc.example/", "acme")).toBe("https://kc.example/realms/acme");
});

test("onProvision creates the realm + reconciles config", async () => {
    const kc = new FakeKeycloak();
    await makeKeycloakHooks({ client: kc }).onProvision({
        tenantId: "acme", issuers: [], providerConfig: { displayName: "ACME", enabled: true },
    });
    expect(kc.created).toEqual(["acme"]);
    expect(kc.updates).toEqual([{ realm: "acme", patch: { displayName: "ACME", enabled: true } }]);
});

test("onProvision idempotent: existing realm (conflict) → no throw, still reconciles", async () => {
    const kc = new FakeKeycloak();
    kc.conflictOnCreate = true;
    await makeKeycloakHooks({ client: kc }).onProvision({
        tenantId: "acme", issuers: [], providerConfig: { displayName: "ACME", enabled: false },
    });
    expect(kc.created).toEqual([]);
    expect(kc.updates).toEqual([{ realm: "acme", patch: { displayName: "ACME", enabled: false } }]);
});

test("onUpdate patches the realm; no providerConfig → no-op", async () => {
    const kc = new FakeKeycloak();
    const hooks = makeKeycloakHooks({ client: kc });
    await hooks.onUpdate({ tenantId: "acme", patch: { providerConfig: { enabled: false } } });
    expect(kc.updates).toEqual([{ realm: "acme", patch: { enabled: false } }]);
    await hooks.onUpdate({ tenantId: "acme", patch: { displayName: "ignored" } });   // no providerConfig
    expect(kc.updates.length).toBe(1);
});

test("onDeprovision deletes the realm only with force", async () => {
    const kc = new FakeKeycloak();
    const hooks = makeKeycloakHooks({ client: kc });
    await hooks.onDeprovision({ tenantId: "acme", force: false });
    expect(kc.deleted).toEqual([]);
    await hooks.onDeprovision({ tenantId: "acme", force: true });
    expect(kc.deleted).toEqual(["acme"]);
});

test("createKeycloakProvider returns a mountable provider", () => {
    const provider = createKeycloakProvider({
        client: new FakeKeycloak(), hubIssuer: "https://hub.example",
        keycloakBaseUrl: "https://kc.example", logStore: new MemoryLogStore(),
    });
    expect(typeof provider.mount).toBe("function");
});
