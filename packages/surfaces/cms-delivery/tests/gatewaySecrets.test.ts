import { describe, expect, spyOn, test } from "bun:test";
import DeliveryCms from "cms-delivery/DeliveryCms";
import { InMemoryGatewayRepository, seedProviders } from "@bernouy/cms-gateway";
import type { Provider } from "@bernouy/cms-gateway";
import { InMemoryRolesRepository, PUBLIC_ROLE } from "@bernouy/cms-permissions";
import type { RolesRepository } from "@bernouy/cms-permissions";
import type { Middleware, RouteHandler, Runner } from "@bernouy/http-runner";

const SECURED: Provider = {
    urn: "urn:secured",
    endpoints: [{
        urn: "urn:secured:get",
        method: "GET",
        targetUrl: "https://api.example.com/data",
        headers: [{ name: "authorization", source: { from: "secret", ref: "${API_KEY}", prefix: "Bearer " } }],
    }],
};

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

function joinPath(base: string, path: string): string {
    const joined = `/${base}/${path}`.replace(/\/+/g, "/");
    return joined.length > 1 && joined.endsWith("/") ? joined.slice(0, -1) : joined;
}

async function publicGatewayRoles(): Promise<RolesRepository> {
    const roles = new InMemoryRolesRepository();
    await roles.upsert({
        id: PUBLIC_ROLE,
        label: "Public",
        builtin: true,
        grants: [{ permission: "urn:secured:get" }],
    });
    return roles;
}

async function mountDeliveryGateway(opts: {
    resolveSecret?: (ref: string) => Promise<string | undefined>;
    roles?: RolesRepository;
} = {}) {
    const gateway = new InMemoryGatewayRepository();
    await seedProviders(gateway, [SECURED]);
    const runner = new CaptureRunner();
    new DeliveryCms({
        runner,
        repository: {} as any,
        gateway,
        gatewayResolveSecret: opts.resolveSecret,
        roles: opts.roles,
    });
    return runner.defaultHandler("GET", "/.cms/gateway");
}

describe("Delivery gateway secrets", () => {
    test("denies gateway execution when roles are not wired", async () => {
        const handler = await mountDeliveryGateway();
        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("upstream"));
        try {
            const res = await handler(new Request("http://site/.cms/gateway/secured/get"));

            expect(res.status).toBe(403);
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            fetchSpy.mockRestore();
        }
    });

    test("keeps secret headers blocked by default", async () => {
        const handler = await mountDeliveryGateway({ roles: await publicGatewayRoles() });
        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("upstream"));
        try {
            const res = await handler(new Request("http://site/.cms/gateway/secured/get"));

            expect(res.status).toBe(500);
            expect(await res.text()).toBe("secret header requires a configured secret store (not wired yet): authorization");
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            fetchSpy.mockRestore();
        }
    });

    test("uses an explicitly wired resolver for dev gateway secrets", async () => {
        const handler = await mountDeliveryGateway({
            resolveSecret: async ref => ref === "${API_KEY}" ? "dev-key" : undefined,
            roles: await publicGatewayRoles(),
        });
        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
        try {
            const res = await handler(new Request("http://site/.cms/gateway/secured/get"));

            expect(res.status).toBe(200);
            const init = fetchSpy.mock.calls[0]![1] as RequestInit;
            expect((init.headers as Headers).get("authorization")).toBe("Bearer dev-key");
        } finally {
            fetchSpy.mockRestore();
        }
    });
});
