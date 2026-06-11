import { describe, test, expect } from "bun:test";
import { authMethodsHandler } from "cms-auth/http/authHandlers";
import { InMemoryIdentityProviderRepository } from "cms-auth/default-implementation/memory/InMemoryIdentityProviderRepository";

describe("authMethodsHandler", () => {
    test("exposes only enabled providers as login methods", async () => {
        const providers = new InMemoryIdentityProviderRepository();
        await providers.create({ id: "local", kind: "local", displayName: "Email", enabled: true });
        await providers.create({ id: "oidc", kind: "oidc", displayName: "SSO", enabled: true });
        await providers.create({ id: "disabled", kind: "oidc", displayName: "Disabled", enabled: false });

        const res = await authMethodsHandler({
            publicBasePath: "/cms/auth",
            identityProviders: providers,
        });

        expect(await res.json()).toEqual([
            { id: "local", displayName: "Email", fields: ["email", "password"] },
            { id: "oidc", displayName: "SSO", loginUrl: "/cms/auth/oidc/login" },
        ]);
    });

    test("returns an empty list when identity providers are not configured", async () => {
        const res = await authMethodsHandler({});
        expect(await res.json()).toEqual([]);
    });

    test("filters providers whose backend kind is not mounted", async () => {
        const providers = new InMemoryIdentityProviderRepository();
        await providers.create({ id: "local", kind: "local", displayName: "Email", enabled: true });
        await providers.create({ id: "oidc", kind: "oidc", displayName: "SSO", enabled: true });

        const res = await authMethodsHandler({
            publicBasePath: "/cms/auth",
            identityProviders: providers,
            supportedKinds: ["local"],
        });

        expect(await res.json()).toEqual([
            { id: "local", displayName: "Email", fields: ["email", "password"] },
        ]);
    });
});
