import { describe, expect, test } from "bun:test";
import DeliveryCms from "cms-delivery/DeliveryCms";
import {
    InMemoryAuthTokenStore,
    InMemoryEmailer,
    InMemoryLocalCredentialStore,
    InMemoryUsersRepository,
    LocalAuthentication,
    SignedCookieCodec,
    SubjectResolver,
    type PublicAuthRoutesConfig,
} from "@bernouy/cms-auth";
import {
    CompositeGatewayRepository,
    InMemoryGatewayRepository,
    SYSTEM_GATEWAY_PROVIDERS,
} from "@bernouy/cms-gateway";
import { InMemoryRolesRepository, PUBLIC_ROLE, USER_ROLE } from "@bernouy/cms-permissions";
import type { Middleware, RouteHandler, Runner } from "@bernouy/http-runner";

type Role = "user";

class CaptureRunner implements Runner {
    private readonly defaults: Map<string, RouteHandler>;

    constructor(readonly basePath: string = "/", sharedDefaults?: Map<string, RouteHandler>) {
        this.defaults = sharedDefaults ?? new Map();
    }

    addEndpoint() {}
    use() {}
    get(path: string, handler: RouteHandler, middlewares?: Middleware[]) { this.addEndpoint("GET", path, handler, middlewares); }
    post(path: string, handler: RouteHandler, middlewares?: Middleware[]) { this.addEndpoint("POST", path, handler, middlewares); }
    patch(path: string, handler: RouteHandler, middlewares?: Middleware[]) { this.addEndpoint("PATCH", path, handler, middlewares); }
    delete(path: string, handler: RouteHandler, middlewares?: Middleware[]) { this.addEndpoint("DELETE", path, handler, middlewares); }
    put(path: string, handler: RouteHandler, middlewares?: Middleware[]) { this.addEndpoint("PUT", path, handler, middlewares); }
    getRequestIP() { return undefined; }
    removeRoutesByPathPrefix() {}
    start() {}
    stop() {}

    group(prefix: string, callback: (runner: Runner) => void): void {
        callback(new CaptureRunner(joinPath(this.basePath, prefix), this.defaults));
    }

    setDefaultEndpoint(method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS", handler: RouteHandler): void {
        this.defaults.set(`${method} ${this.basePath}`, handler);
    }

    defaultHandler(method: string, prefix: string): RouteHandler {
        const handler = this.defaults.get(`${method} ${prefix}`);
        if (!handler) throw new Error(`missing captured handler: ${method} ${prefix}`);
        return handler;
    }
}

async function setup() {
    const runner = new CaptureRunner();
    const users = new InMemoryUsersRepository<Role>();
    const credentials = new InMemoryLocalCredentialStore();
    const emailer = new InMemoryEmailer();
    const resolver = new SubjectResolver<Role>(users, "user");
    const auth: PublicAuthRoutesConfig<Role> = {
        local: new LocalAuthentication<Role>({
            providerId: "local",
            loginPagePath: "/login",
            logoutPath: "/.cms/auth/logout",
            credentials,
            resolver,
            codec: new SignedCookieCodec(new TextEncoder().encode("test-secret-key-at-least-16-bytes")),
            cookieName: "site-session",
        }),
        credentials,
        users,
        tokens: new InMemoryAuthTokenStore(),
        emailer,
        defaultRole: "user",
        emailVerificationUrl: "http://site.test/auth/verify-email",
        passwordResetUrl: "http://site.test/auth/reset-password",
        authEmailCooldownSeconds: 0,
    };
    const gateway = new CompositeGatewayRepository(new InMemoryGatewayRepository(), SYSTEM_GATEWAY_PROVIDERS);
    const roles = new InMemoryRolesRepository();
    const grants = [
        "me",
        "login",
        "logout",
        "signup",
        "requestEmailVerification",
        "confirmEmailVerification",
        "requestPasswordReset",
        "confirmPasswordReset",
    ].map((endpoint) => ({ permission: `urn:system-auth:${endpoint}` }));
    await roles.upsert({ id: PUBLIC_ROLE, label: "Public", builtin: true, grants });
    await roles.upsert({ id: USER_ROLE, label: "User", builtin: true, grants });
    new DeliveryCms({ runner, repository: {} as any, auth, gateway, roles });
    return {
        emailer,
        credentials,
        get:  runner.defaultHandler("GET", "/.cms/gateway"),
        post: runner.defaultHandler("POST", "/.cms/gateway"),
    };
}

describe("Delivery system auth gateway", () => {
    test("signup, verification, login, me and logout run through system-auth", async () => {
        const { post, get, emailer } = await setup();

        expect((await post(jsonRequest("/signup", { email: "Ada@Example.com", password: "password-1", displayName: "Ada" }))).status).toBe(200);
        expect(emailer.sent).toHaveLength(1);

        const blocked = await post(jsonRequest("/login", { email: "ada@example.com", password: "password-1" }));
        expect(blocked.status).toBe(401);
        expect(blocked.headers.get("set-cookie")).toBeNull();

        const token = tokenFrom(emailer.sent[0]!.text);
        expect((await post(jsonRequest("/confirmEmailVerification", { token }))).status).toBe(200);

        const loggedIn = await post(jsonRequest("/login", { email: "ada@example.com", password: "password-1" }));
        expect(loggedIn.status).toBe(200);
        const cookie = sessionCookie(loggedIn);
        expect(cookie).toContain("site-session=");

        const me = await get(new Request(url("/me"), { headers: { cookie } }));
        expect((await me.json() as { subject: { role: string } | null }).subject?.role).toBe("user");

        const logout = await post(jsonRequest("/logout", {}));
        expect(logout.status).toBe(200);
        expect(logout.headers.get("set-cookie")).toContain("site-session=");
    });

    test("password reset runs through system-auth and verifies the credential", async () => {
        const { post, emailer, credentials } = await setup();

        await post(jsonRequest("/signup", { email: "reset@example.com", password: "old-password" }));
        expect((await post(jsonRequest("/requestPasswordReset", { email: "reset@example.com" }))).status).toBe(200);
        expect(emailer.sent.at(-1)?.text).toContain("http://site.test/auth/reset-password?token=");

        const token = tokenFrom(emailer.sent.at(-1)!.text);
        expect((await post(jsonRequest("/confirmPasswordReset", { token, password: "new-password" }))).status).toBe(200);
        expect((await credentials.getByEmail("reset@example.com"))?.emailVerifiedAt).toBeInstanceOf(Date);
        expect((await post(jsonRequest("/login", { email: "reset@example.com", password: "old-password" }))).status).toBe(401);
        expect((await post(jsonRequest("/login", { email: "reset@example.com", password: "new-password" }))).status).toBe(200);
    });
});

function jsonRequest(endpoint: string, body: unknown): Request {
    return new Request(url(endpoint), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function url(endpoint: string): string {
    return `http://site/.cms/gateway/system-auth${endpoint}`;
}

function tokenFrom(text: string): string {
    const match = /https?:\/\/\S+/.exec(text);
    if (!match) throw new Error(`missing URL in ${text}`);
    const token = new URL(match[0]).searchParams.get("token");
    if (!token) throw new Error(`missing token in ${match[0]}`);
    return token;
}

function sessionCookie(res: Response): string {
    return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function joinPath(base: string, path: string): string {
    const joined = `/${base}/${path}`.replace(/\/+/g, "/");
    return joined.length > 1 && joined.endsWith("/") ? joined.slice(0, -1) : joined;
}
