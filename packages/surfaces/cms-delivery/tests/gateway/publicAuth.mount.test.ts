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
import type { Middleware, RouteHandler, Runner } from "@bernouy/http-runner";

type Role = "user";

class CaptureRunner implements Runner {
    readonly endpoints = new Set<string>();
    readonly handlers = new Map<string, RouteHandler>();

    constructor(
        readonly basePath: string = "/",
        private readonly root: CaptureRunner | null = null,
    ) {}

    addEndpoint(
        method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS",
        path: string,
        handler: RouteHandler,
        _middlewares?: Middleware[],
    ): void {
        const route = `${method} ${joinPath(this.basePath, path)}`;
        this.target.endpoints.add(route);
        this.target.handlers.set(route, handler);
    }
    use() {}
    get(path: string, handler: RouteHandler, middlewares?: Middleware[]) {
        this.addEndpoint("GET", path, handler, middlewares);
    }
    post(path: string, handler: RouteHandler, middlewares?: Middleware[]) {
        this.addEndpoint("POST", path, handler, middlewares);
    }
    patch(path: string, handler: RouteHandler, middlewares?: Middleware[]) {
        this.addEndpoint("PATCH", path, handler, middlewares);
    }
    delete(path: string, handler: RouteHandler, middlewares?: Middleware[]) {
        this.addEndpoint("DELETE", path, handler, middlewares);
    }
    put(path: string, handler: RouteHandler, middlewares?: Middleware[]) {
        this.addEndpoint("PUT", path, handler, middlewares);
    }
    getRequestIP() {
        return undefined;
    }
    removeRoutesByPathPrefix() {}
    start() {}
    stop() {}

    group(prefix: string, callback: (runner: Runner) => void): void {
        callback(new CaptureRunner(joinPath(this.basePath, prefix), this.target));
    }

    setDefaultEndpoint(
        method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS",
        _handler: RouteHandler,
        _middlewares?: Middleware[],
    ): void {
        this.target.endpoints.add(`${method} ${this.basePath}`);
    }

    private get target(): CaptureRunner {
        return this.root ?? this;
    }

    handler(method: "GET" | "POST", path: string): RouteHandler {
        const handler = this.handlers.get(`${method} ${path}`);
        if (!handler) {
            throw new Error(`Missing handler for ${method} ${path}`);
        }
        return handler;
    }
}

describe("Delivery public auth mount", () => {
    test("does not mount public auth routes without auth config", () => {
        const runner = new CaptureRunner();
        new DeliveryCms({ runner, repository: {} as any });
        expect(runner.endpoints.has("GET /.cms/auth/me")).toBe(false);
    });

    test("mounts public auth routes when auth config is provided", () => {
        const runner = new CaptureRunner();
        new DeliveryCms({ runner, repository: {} as any, auth: authConfig() });
        expect(runner.endpoints.has("POST /.cms/auth/signup")).toBe(true);
        expect(runner.endpoints.has("POST /.cms/auth/login")).toBe(true);
        expect(runner.endpoints.has("GET /.cms/auth/me")).toBe(true);
    });

    test("keeps auth-only signup working when the source gateway is absent", async () => {
        const runner = new CaptureRunner();
        new DeliveryCms({ runner, repository: {} as any, auth: authConfig() });

        const response = await runner.handler(
            "POST",
            "/.cms/auth/signup",
        )(
            new Request("http://site.test/.cms/auth/signup", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email: "auth-only@example.test", password: "password-1" }),
            }),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
    });
});

function authConfig(): PublicAuthRoutesConfig<Role> {
    const users = new InMemoryUsersRepository<Role>();
    const credentials = new InMemoryLocalCredentialStore();
    const resolver = new SubjectResolver<Role>(users, "user");
    return {
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
        emailer: new InMemoryEmailer(),
        defaultRole: "user",
        emailVerificationUrl: "http://site.test/auth/verify-email",
        passwordResetUrl: "http://site.test/auth/reset-password",
    };
}

function joinPath(base: string, path: string): string {
    const joined = `/${base}/${path}`.replace(/\/+/g, "/");
    return joined.length > 1 && joined.endsWith("/") ? joined.slice(0, -1) : joined;
}
