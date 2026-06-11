import { describe, test, expect } from "bun:test";
import {
    AuthValidationError,
    deleteIdentityProvider,
    isBuiltinProvider,
    updateIdentityProvider,
} from "@bernouy/cms-auth";
import { InMemoryIdentityProviderRepository } from "cms-auth/default-implementation/memory/InMemoryIdentityProviderRepository";
import { InMemoryUsersRepository } from "cms-auth/default-implementation/memory/InMemoryUsersRepository";
import type { NewIdentityProvider } from "cms-auth/interfaces/IdentityProvider";

type Role = "admin" | "user";

const provider = (id: string, enabled = true): NewIdentityProvider => ({
    id,
    kind: id === "local" ? "local" : "oidc",
    displayName: id,
    enabled,
    issuer: "https://issuer",
    clientId: "client",
});

async function setup() {
    const identityProviders = new InMemoryIdentityProviderRepository();
    const users = new InMemoryUsersRepository<Role>();
    await identityProviders.create(provider("local"));
    await identityProviders.create(provider("oidc"));
    await users.upsert({ sub: "local:u1", provider: "local", email: "a@x.com" }, "admin");
    return { identityProviders, users };
}

describe("identity provider rules", () => {
    test("knows the builtin provider kind", () => {
        expect(isBuiltinProvider("local")).toBe(true);
        expect(isBuiltinProvider("oidc")).toBe(false);
    });

    test("refuses to delete the builtin provider", async () => {
        const stores = await setup();
        await expect(deleteIdentityProvider(stores, "local")).rejects.toBeInstanceOf(AuthValidationError);
    });

    test("refuses to remove or disable the last admin login path", async () => {
        const stores = await setup();
        await expect(deleteIdentityProvider(stores, "oidc")).resolves.toBe(true);
        await expect(updateIdentityProvider(stores, "local", { enabled: false })).rejects.toMatchObject({ field: "enabled" });
    });

    test("allows builtin toggle when another admin login path remains", async () => {
        const stores = await setup();
        await stores.users.upsert({ sub: "oidc:u2", provider: "oidc", email: "b@x.com" }, "admin");
        const updated = await updateIdentityProvider(stores, "local", { enabled: false });
        expect(updated.enabled).toBe(false);
    });

    test("refuses to edit builtin provider fields", async () => {
        const stores = await setup();
        await expect(updateIdentityProvider(stores, "local", { displayName: "Local Login" }))
            .rejects.toMatchObject({ field: "id" });
    });
});
