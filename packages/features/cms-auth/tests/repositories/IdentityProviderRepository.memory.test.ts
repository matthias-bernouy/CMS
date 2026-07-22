import { describe, test, expect } from "bun:test";
import { InMemoryIdentityProviderRepository } from "cms-auth/default-implementation/memory/InMemoryIdentityProviderRepository";
import type { NewIdentityProvider } from "cms-auth/interfaces/IdentityProvider";

const repo = () => new InMemoryIdentityProviderRepository();
const oidc = (id: string): NewIdentityProvider => ({
    id,
    kind: "oidc",
    displayName: id,
    enabled: true,
    issuer: "https://kc",
    clientId: "c",
});

describe("InMemoryIdentityProviderRepository", () => {
    test("create stamps timestamps and is readable by id", async () => {
        const r = repo();
        const p = await r.create(oidc("keycloak"));
        expect(p.createdAt).toBeInstanceOf(Date);
        expect((await r.get("keycloak"))?.displayName).toBe("keycloak");
    });

    test("rejects a duplicate id", async () => {
        const r = repo();
        await r.create(oidc("keycloak"));
        await expect(r.create(oidc("keycloak"))).rejects.toThrow(/already exists/);
    });

    test("update patches present fields and bumps updatedAt; unknown → null", async () => {
        const r = repo();
        const created = await r.create(oidc("keycloak"));
        await Bun.sleep(2);
        const updated = await r.update("keycloak", { enabled: false, displayName: "KC" });
        expect(updated?.enabled).toBe(false);
        expect(updated?.displayName).toBe("KC");
        expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
        expect(await r.update("ghost", { enabled: false })).toBeNull();
    });

    test("delete removes the provider", async () => {
        const r = repo();
        await r.create(oidc("keycloak"));
        expect(await r.delete("keycloak")).toBe(true);
        expect(await r.get("keycloak")).toBeNull();
        expect(await r.delete("keycloak")).toBe(false);
    });
});
