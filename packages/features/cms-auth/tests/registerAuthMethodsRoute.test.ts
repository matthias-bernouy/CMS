import { describe, test, expect } from "bun:test";
import type { Runner } from "@bernouy/http-runner";
import { registerAuthMethodsRoute } from "cms-auth/http/registerAuthRoutes";
import { InMemoryIdentityProviderRepository } from "cms-auth/default-implementation/memory/InMemoryIdentityProviderRepository";

type Handler = (req: Request) => Promise<Response> | Response;

function captureRunner() {
    const routes: Record<string, Handler> = {};
    const runner = {
        group(prefix: string, cb: (r: { addEndpoint: (m: string, p: string, h: Handler) => void }) => void) {
            cb({ addEndpoint: (m, p, h) => { routes[`${m} ${prefix}${p}`] = h; } });
        },
    } as unknown as Runner;
    return { runner, routes };
}

describe("registerAuthMethodsRoute", () => {
    test("exposes only enabled providers as login methods", async () => {
        const providers = new InMemoryIdentityProviderRepository();
        await providers.create({ id: "local", kind: "local", displayName: "Email", enabled: true });
        await providers.create({ id: "oidc", kind: "oidc", displayName: "SSO", enabled: true });
        await providers.create({ id: "disabled", kind: "oidc", displayName: "Disabled", enabled: false });
        const { runner, routes } = captureRunner();

        registerAuthMethodsRoute(runner, {
            basePath: "/auth",
            publicBasePath: "/cms/auth",
            identityProviders: providers,
        });

        const res = await routes["GET /auth/methods"]!(new Request("http://x/auth/methods"));
        expect(await res.json()).toEqual([
            { id: "local", displayName: "Email", fields: ["email", "password"] },
            { id: "oidc", displayName: "SSO", loginUrl: "/cms/auth/oidc/login" },
        ]);
    });

    test("returns an empty list when identity providers are not configured", async () => {
        const { runner, routes } = captureRunner();
        registerAuthMethodsRoute(runner, { basePath: "/auth" });
        const res = await routes["GET /auth/methods"]!(new Request("http://x/auth/methods"));
        expect(await res.json()).toEqual([]);
    });
});
