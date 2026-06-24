import { describe, expect, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { type Middleware, type RouteHandler, type Runner } from "@bernouy/http-runner";
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
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { ControlCms } from "cms-control/ControlCms";
import type { CMS_ROLES } from "types/roles";

class CaptureRunner implements Runner {
    readonly endpoints = new Map<string, number>();

    constructor(readonly basePath: string = "/", private readonly root: CaptureRunner | null = null) {}

    addEndpoint(method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS", path: string, _handler: RouteHandler, middlewares: Middleware[] = []): void {
        this.target.endpoints.set(`${method} ${joinPath(this.basePath, path)}`, middlewares.length);
    }
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

    group(prefix: string, callback: (runner: Runner) => void, middlewares: Middleware[] = []): void {
        callback(new GroupRunner(joinPath(this.basePath, prefix), this.target, middlewares));
    }

    setDefaultEndpoint(method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS", _handler: RouteHandler, middlewares: Middleware[] = []): void {
        this.target.endpoints.set(`${method} ${this.basePath}`, middlewares.length);
    }

    private get target(): CaptureRunner {
        return this.root ?? this;
    }
}

class GroupRunner extends CaptureRunner {
    constructor(basePath: string, root: CaptureRunner, private readonly groupMiddlewares: Middleware[]) {
        super(basePath, root);
    }

    override addEndpoint(method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS", path: string, handler: RouteHandler, middlewares: Middleware[] = []): void {
        super.addEndpoint(method, path, handler, [...this.groupMiddlewares, ...middlewares]);
    }

    override setDefaultEndpoint(method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS", handler: RouteHandler, middlewares: Middleware[] = []): void {
        super.setDefaultEndpoint(method, handler, [...this.groupMiddlewares, ...middlewares]);
    }

    override group(prefix: string, callback: (runner: Runner) => void, middlewares: Middleware[] = []): void {
        callback(new GroupRunner(joinPath(this.basePath, prefix), this, [...this.groupMiddlewares, ...middlewares]));
    }
}

describe("Control public auth mount", () => {
    test("mounts public auth routes unguarded and disables signup", async () => {
        const runner = new CaptureRunner();
        const repository = new InMemoryCmsRepository();
        const { local, credentials, users, publicAuth } = authSystem();
        const cms = new ControlCms(
            runner,
            repository,
            local,
            { publicAuth },
            undefined,
            undefined,
            undefined,
            undefined,
            users,
            undefined,
            undefined,
            credentials,
            undefined,
            undefined,
            new InMemoryRolesRepository(),
            { local },
        );
        await cms.ready;

        expect(runner.endpoints.get("POST /.cms/auth/login")).toBe(0);
        expect(runner.endpoints.has("POST /.cms/auth/signup")).toBe(false);
    });
});

function authSystem() {
    const users = new InMemoryUsersRepository<CMS_ROLES>();
    const credentials = new InMemoryLocalCredentialStore();
    const resolver = new SubjectResolver<CMS_ROLES>(users, "user");
    const local = new LocalAuthentication<CMS_ROLES>({
        providerId: "local",
        loginPagePath: "/login",
        logoutPath: "/auth/logout",
        credentials,
        resolver,
        codec: new SignedCookieCodec(new TextEncoder().encode("test-secret-key-at-least-16-bytes")),
        cookieName: "cms-session",
    });
    const publicAuth: PublicAuthRoutesConfig<CMS_ROLES> = {
        local,
        credentials,
        users,
        tokens: new InMemoryAuthTokenStore(),
        emailer: new InMemoryEmailer(),
        defaultRole: "user",
        emailVerificationUrl: "http://control.test/auth/verify-email",
        passwordResetUrl: "http://control.test/auth/reset-password",
    };
    return { local, credentials, users, publicAuth };
}

function joinPath(base: string, path: string): string {
    const joined = `/${base}/${path}`.replace(/\/+/g, "/");
    return joined.length > 1 && joined.endsWith("/") ? joined.slice(0, -1) : joined;
}
