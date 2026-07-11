import DeliveryCms from "cms-delivery/DeliveryCms";
import { P9R_CACHE, type ContentReader, type TPage, type TSystem } from "@bernouy/cms-content";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySourceRepository, seedSources, type Source } from "@bernouy/cms-sources";
import { compress, InMemoryCache, type Middleware, type RouteHandler, type Runner } from "@bernouy/http-runner";

const SHOP_SOURCE: Source = {
    urn: "urn:shop",
    endpoints: [
        { urn: "urn:shop:listProducts", method: "GET", access: { mode: "public" }, targetUrl: "https://api.example.com/products" },
        { urn: "urn:shop:createOrder", method: "POST", access: { mode: "system" }, targetUrl: "https://api.example.com/orders" },
    ],
};

const system: TSystem = {
    initializationStep: 1,
    site: { name: "Site", favicon: "", visible: true, host: "", language: "", theme: "", notFound: null, forbidden: null, serverError: null, login: null },
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

export async function mountPage(options: {
    content: string;
    roles?: InMemoryRolesRepository;
    auth?: unknown;
    systemPages?: Partial<Pick<TSystem["site"], "notFound" | "forbidden" | "serverError" | "login">>;
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
        repository: pageRepository(options.content, options.systemPages),
        cache,
        sources,
        roles,
        auth: options.auth as never,
    });
    return { handler: runner.defaultHandler("GET", "/"), roles };
}

export function authSubject(subject: { identifier: string; role: string } | null): unknown {
    return {
        local: {
            getSubject: async () => subject,
            buildLoginUrl: (returnTo: string) => `/login?returnTo=${encodeURIComponent(returnTo)}`,
        },
    };
}

function pageRepository(
    content: string,
    systemPages: Partial<Pick<TSystem["site"], "notFound" | "forbidden" | "serverError" | "login">> = {},
): ContentReader {
    const page: TPage = { path: "/products", title: "Products", description: "", content, visible: true, tags: [] };
    return {
        getPage: async () => page,
        getAllPages: async () => [page],
        getPublishedPage: async () => page,
        getPublishedPages: async () => [page],
        getBlocsList: async () => [],
        getBlocViewJS: async () => null,
        getSystem: async () => ({ ...system, site: { ...system.site, ...systemPages } }),
    };
}

function joinPath(base: string, path: string): string {
    const joined = `/${base}/${path}`.replace(/\/+/g, "/");
    return joined.length > 1 && joined.endsWith("/") ? joined.slice(0, -1) : joined;
}
