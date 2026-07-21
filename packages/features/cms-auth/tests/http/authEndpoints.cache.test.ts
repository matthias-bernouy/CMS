import { describe, expect, test } from "bun:test";
import type { Runner, RouteHandler } from "@bernouy/http-runner";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import {
    InMemoryIdentityProviderRepository,
    InMemoryLocalCredentialStore,
    InMemoryUsersRepository,
    LocalAuthentication,
    OidcAuthentication,
    SignedCookieCodec,
    SubjectResolver,
    authMethodsHandler,
    executeAuthSystemSourceEndpoint,
    registerPublicAuthRoutes,
    type PublicAuthRoutesConfig,
} from "@bernouy/cms-auth";

type Role = "user";

describe("authentication endpoint cache policy", () => {
    test("protects direct and system-source current-user responses", async () => {
        const subject = { identifier: "local:user-1", role: "user" as const, displayName: "Ada" };
        const cfg = {
            local: {
                getSubject: async () => subject,
                loginJson: () => {
                    throw new Error("not used");
                },
                logoutJson: () => {
                    throw new Error("not used");
                },
            },
        } as unknown as PublicAuthRoutesConfig<Role>;
        const routes = new Map<string, RouteHandler>();
        registerPublicAuthRoutes(
            {
                addEndpoint: (method: string, path: string, handler: RouteHandler) => {
                    routes.set(`${method} ${path}`, handler);
                },
            } as Runner,
            cfg,
        );

        const request = new Request("http://site/.cms/auth/me", {
            headers: { cookie: "cms-session=session-token" },
        });
        const direct = await routes.get("GET /me")!(request);
        const system = await executeAuthSystemSourceEndpoint(
            cfg,
            {
                urn: "urn:system-auth:me",
                targetUrl: "cms-system://auth/me",
            },
            request,
        );

        expect(await direct.json()).toEqual({ subject });
        expect(await system.json()).toEqual({ subject });
        expectPrivatePolicy(direct);
        expectPrivatePolicy(system);
    });

    test("protects disabled system signup without changing its response", async () => {
        const cfg = { allowSignup: false } as PublicAuthRoutesConfig<Role>;
        const response = await executeAuthSystemSourceEndpoint(
            cfg,
            {
                urn: "urn:system-auth:signup",
                targetUrl: "cms-system://auth/signup",
            },
            new Request("http://site/.cms/sources/system-auth/signup", { method: "POST" }),
        );

        expect(response.status).toBe(404);
        expect(await response.text()).toBe("not_found");
        expectPrivatePolicy(response);
    });

    test("protects local redirects, JSON failures and logout cookies", async () => {
        const { auth, credentials } = localAuth();
        await credentials.create({ email: "ada@example.test", password: "password-1" });

        const login = await auth.login(loginRequest("password-1"));
        expect(login.status).toBe(302);
        expect(login.headers.get("location")).toBe("/admin");
        expect(login.headers.get("set-cookie")).toContain("cms-session=");

        const rejected = await auth.loginJson(loginRequest("wrong-password"));
        expect(rejected.status).toBe(401);
        expect(await rejected.json()).toEqual({ error: "invalid_credentials" });

        const logout = auth.logout(new Request("http://site/auth/logout?returnTo=/goodbye"));
        expect(logout.status).toBe(302);
        expect(logout.headers.get("location")).toBe("/goodbye");
        expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");

        for (const response of [login, rejected, logout, auth.logoutJson()]) {
            expectPrivatePolicy(response);
        }
    });

    test("protects auth discovery and OIDC error responses", async () => {
        const methods = await authMethodsHandler({});
        expect(await methods.json()).toEqual([]);
        expectPrivatePolicy(methods);

        const users = new InMemoryUsersRepository<Role>();
        const oidc = new OidcAuthentication<Role>({
            callbackBase: "https://site.test/auth",
            providers: new InMemoryIdentityProviderRepository(),
            secrets: new InMemorySecretStore(),
            resolver: new SubjectResolver(users, "user"),
            codec: codec(),
            cookieName: "cms-session",
            loginPagePath: "/login",
            defaultHome: "/admin",
        });
        const unknown = await oidc.login(new Request("https://site.test/auth/missing/login"));
        expect(unknown.status).toBe(404);
        expect(await unknown.text()).toBe("Unknown provider");
        expectPrivatePolicy(unknown);
    });
});

function localAuth() {
    const users = new InMemoryUsersRepository<Role>();
    const credentials = new InMemoryLocalCredentialStore();
    const auth = new LocalAuthentication<Role>({
        providerId: "local",
        loginPagePath: "/login",
        logoutPath: "/auth/logout",
        credentials,
        resolver: new SubjectResolver(users, "user"),
        codec: codec(),
        cookieName: "cms-session",
        defaultHome: "/admin",
    });
    return { auth, credentials };
}

function codec(): SignedCookieCodec {
    return new SignedCookieCodec(new TextEncoder().encode("test-secret-key-at-least-16-bytes"));
}

function loginRequest(password: string): Request {
    return new Request("http://site/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "ada@example.test", password }),
    });
}

function expectPrivatePolicy(response: Response): void {
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("vary")).toBe("Cookie, Authorization");
}
