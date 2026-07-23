import {
    InMemoryAuthTokenStore,
    InMemoryAuthentication,
    InMemoryEmailer,
    InMemoryLocalCredentialStore,
    InMemoryUsersRepository,
    LocalAuthentication,
    SignedCookieCodec,
    SubjectResolver,
    type PublicAuthRoutesConfig,
} from "@bernouy/cms-auth";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import type { InMemorySourceRepository } from "@bernouy/cms-sources";
import { type Middleware, type RouteHandler, type Runner } from "@bernouy/http-runner";
import { ControlCms } from "cms-control/ControlCms";
import type { CMS_ROLES } from "types/roles";

export class CaptureRunner implements Runner {
    readonly endpoints = new Map<string, number>();
    readonly handlers = new Map<string, RouteHandler>();
    readonly middlewareChains = new Map<string, Middleware[]>();

    /** For tests that only assert the synchronously mounted route groups. */
    static withoutFileApi(): CaptureRunner {
        return new CaptureRunner("/", null, false);
    }

    constructor(
        readonly basePath: string = "/",
        private readonly root: CaptureRunner | null = null,
        protected readonly mountFileApi = true,
    ) {}

    addEndpoint(
        method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS",
        path: string,
        handler: RouteHandler,
        middlewares: Middleware[] = [],
    ): void {
        const key = `${method} ${joinPath(this.basePath, path)}`;
        this.target.endpoints.set(key, middlewares.length);
        this.target.handlers.set(key, handler);
        this.target.middlewareChains.set(key, middlewares);
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

    group(prefix: string, callback: (runner: Runner) => void, middlewares: Middleware[] = []): void {
        if (this.mountFileApi || prefix !== "/api") {
            callback(new GroupRunner(joinPath(this.basePath, prefix), this.target, middlewares, this.mountFileApi));
        }
    }

    setDefaultEndpoint(
        method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS",
        handler: RouteHandler,
        middlewares: Middleware[] = [],
    ): void {
        const key = `${method} ${this.basePath}`;
        this.target.endpoints.set(key, middlewares.length);
        this.target.handlers.set(key, handler);
        this.target.middlewareChains.set(key, middlewares);
    }

    async handle(method: string, path: string, request: Request): Promise<Response> {
        const key = `${method} ${path}`;
        const handler = this.target.handlers.get(key);
        if (!handler) {
            throw new Error(`Route not mounted: ${key}`);
        }
        let next = () => Promise.resolve(handler(request));
        for (const middleware of [...(this.target.middlewareChains.get(key) ?? [])].reverse()) {
            const downstream = next;
            next = () => middleware(request, downstream);
        }
        return next();
    }

    private get target(): CaptureRunner {
        return this.root ?? this;
    }
}

class GroupRunner extends CaptureRunner {
    constructor(
        basePath: string,
        root: CaptureRunner,
        private readonly groupMiddlewares: Middleware[],
        mountFileApi: boolean,
    ) {
        super(basePath, root, mountFileApi);
    }

    override addEndpoint(
        method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS",
        path: string,
        handler: RouteHandler,
        middlewares: Middleware[] = [],
    ): void {
        super.addEndpoint(method, path, handler, [...this.groupMiddlewares, ...middlewares]);
    }

    override setDefaultEndpoint(
        method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS",
        handler: RouteHandler,
        middlewares: Middleware[] = [],
    ): void {
        super.setDefaultEndpoint(method, handler, [...this.groupMiddlewares, ...middlewares]);
    }

    override group(prefix: string, callback: (runner: Runner) => void, middlewares: Middleware[] = []): void {
        const basePath = joinPath(this.basePath, prefix);
        const groupedMiddlewares = [...this.groupMiddlewares, ...middlewares];
        callback(new GroupRunner(basePath, this, groupedMiddlewares, this.mountFileApi));
    }
}

export async function mountedSourceHandler(role: CMS_ROLES, sources: InMemorySourceRepository): Promise<RouteHandler> {
    const runner = CaptureRunner.withoutFileApi();
    const cms = new ControlCms(
        runner,
        new InMemoryCmsRepository(),
        new InMemoryAuthentication<CMS_ROLES>({ role }),
        {},
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        sources,
        undefined,
        new InMemoryRolesRepository(),
    );
    await cms.ready;
    const handler = runner.handlers.get("POST /.cms/sources");
    if (!handler) {
        throw new Error("Control source handler was not mounted");
    }
    return handler;
}

export function authSystem() {
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
