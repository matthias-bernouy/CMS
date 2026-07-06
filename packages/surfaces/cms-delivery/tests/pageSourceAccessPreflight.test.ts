import { describe, expect, test } from "bun:test";
import DeliveryCms from "cms-delivery/DeliveryCms";
import { P9R_CACHE, type ContentReader, type TPage, type TSystem } from "@bernouy/cms-content";
import { InMemoryRolesRepository, PUBLIC_ROLE, USER_ROLE } from "@bernouy/cms-permissions";
import { InMemorySourceRepository, seedSources, type Source } from "@bernouy/cms-sources";
import { compress, InMemoryCache, type Middleware, type RouteHandler, type Runner } from "@bernouy/http-runner";

const SHOP_SOURCE: Source = {
    urn: "urn:shop",
    endpoints: [
        { urn: "urn:shop:listProducts", method: "GET", targetUrl: "https://api.example.com/products" },
        { urn: "urn:shop:createOrder", method: "POST", targetUrl: "https://api.example.com/orders" },
    ],
};

const system: TSystem = {
    initializationStep: 1,
    site: { name: "Site", favicon: "", visible: true, host: "", language: "", theme: "", notFound: null, serverError: null },
    editor: { layoutCategory: "" },
    security: { connectExtras: [], mediaExtras: [] },
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

describe("Delivery page source access preflight", () => {
    test("redirects anonymous visitors when an auto source is not granted", async () => {
        const { handler } = await mountPage({
            content: `<section cms-source="/.cms/sources/shop/listProducts as products"><p>Products</p></section>`,
            auth: authSubject(null),
        });

        const res = await handler(new Request("http://site/products?category=shoes"));

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/login?returnTo=%2Fproducts%3Fcategory%3Dshoes");
    });

    test("returns 403 when an authenticated visitor lacks the auto source grant", async () => {
        const { handler } = await mountPage({
            content: `<section cms-source="/.cms/sources/shop/listProducts as products"><p>Products</p></section>`,
            auth: authSubject({ identifier: "user-1", role: USER_ROLE }),
        });

        const res = await handler(new Request("http://site/products"));

        expect(res.status).toBe(403);
        expect(await res.text()).toBe("Forbidden");
    });

    test("serves the page when the visitor role can access every auto source", async () => {
        const roles = new InMemoryRolesRepository();
        await roles.upsert({
            id: PUBLIC_ROLE,
            label: "Public",
            builtin: true,
            grants: [{ permission: "urn:shop:listProducts" }],
        });
        const { handler } = await mountPage({
            content: `<section cms-source="/.cms/sources/shop/listProducts as products"><p>Products</p></section>`,
            roles,
            auth: authSubject(null),
        });

        const res = await handler(new Request("http://site/products"));

        expect(res.status).toBe(200);
        expect(await res.text()).toContain("Products");
    });

    test("does not block initial page rendering for submit sources", async () => {
        const { handler } = await mountPage({
            content: `<form cms-source="/.cms/sources/shop/createOrder" cms-source-method="post" cms-source-trigger="submit"><button>Buy</button></form>`,
            auth: authSubject(null),
        });

        const res = await handler(new Request("http://site/checkout"));

        expect(res.status).toBe(200);
        expect(await res.text()).toContain("Buy");
    });

    test("runs source access checks before serving a cached page", async () => {
        const roles = new InMemoryRolesRepository();
        await roles.upsert({
            id: PUBLIC_ROLE,
            label: "Public",
            builtin: true,
            grants: [{ permission: "urn:shop:listProducts" }],
        });
        const { handler } = await mountPage({
            content: `<section cms-source="/.cms/sources/shop/listProducts as products"><p>Products</p></section>`,
            roles,
            auth: authSubject(null),
        });

        expect((await handler(new Request("http://site/products"))).status).toBe(200);

        await roles.upsert({
            id: PUBLIC_ROLE,
            label: "Public",
            builtin: true,
            grants: [],
        });
        const denied = await handler(new Request("http://site/products"));

        expect(denied.status).toBe(302);
    });
});

async function mountPage(options: {
    content: string;
    roles?: InMemoryRolesRepository;
    auth?: unknown;
}): Promise<{ handler: RouteHandler; roles: InMemoryRolesRepository }> {
    const runner = new CaptureRunner();
    const roles = options.roles ?? new InMemoryRolesRepository();
    const sources = new InMemorySourceRepository();
    const cache = new InMemoryCache();
    cache.set(P9R_CACHE.js("/.cms/assets/component.js"), compress("component", "text/javascript"));
    cache.set(P9R_CACHE.js("/.cms/assets/cms-binding-core.js"), compress("binding", "text/javascript"));
    cache.set(P9R_CACHE.STYLE, compress("body{}", "text/css"));
    await seedSources(sources, [SHOP_SOURCE]);
    new DeliveryCms({
        runner,
        repository: pageRepository(options.content),
        cache,
        sources,
        roles,
        auth: options.auth as never,
    });
    return { handler: runner.defaultHandler("GET", "/"), roles };
}

function pageRepository(content: string): ContentReader {
    const page: TPage = {
        path: "/products",
        title: "Products",
        description: "",
        content,
        visible: true,
        tags: [],
    };
    return {
        getPage: async () => page,
        getAllPages: async () => [page],
        getPublishedPage: async () => page,
        getPublishedPages: async () => [page],
        getBlocsList: async () => [],
        getBlocViewJS: async () => null,
        getSystem: async () => system,
    };
}

function authSubject(subject: { identifier: string; role: string } | null): unknown {
    return {
        local: {
            getSubject: async () => subject,
            buildLoginUrl: (returnTo: string) => `/login?returnTo=${encodeURIComponent(returnTo)}`,
        },
    };
}

function joinPath(base: string, path: string): string {
    const joined = `/${base}/${path}`.replace(/\/+/g, "/");
    return joined.length > 1 && joined.endsWith("/") ? joined.slice(0, -1) : joined;
}
