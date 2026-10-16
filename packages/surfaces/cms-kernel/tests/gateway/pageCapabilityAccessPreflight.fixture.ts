import KernelCms from "cms-kernel/KernelCms";
import type { Authentication } from "@bernouy/cms-auth";
import {
    createContentReader,
    CMS_CACHE_KEYS,
    type CmsRepository,
    type TPage,
    type TSystem,
} from "@bernouy/cms-content";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import { PageExecutionService, type PageExecutionAuthority } from "@bernouy/cms-gateway/execution";
import { compress, InMemoryCache, type Middleware, type RouteHandler, type Runner } from "@bernouy/http-runner";

const system: TSystem = {
    initializationStep: 1,
    site: {
        name: "Site",
        favicon: "",
        visible: true,
        host: "",
        language: "",
        theme: "",
        notFound: null,
        forbidden: null,
        serverError: null,
        login: null,
    },
    security: { connectExtras: [], mediaExtras: [] },
};

class CaptureRunner implements Runner {
    private readonly defaults: Map<string, RouteHandler>;

    constructor(
        readonly basePath: string = "/",
        sharedDefaults?: Map<string, RouteHandler>,
    ) {
        this.defaults = sharedDefaults ?? new Map();
    }

    addEndpoint() {}
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
        callback(new CaptureRunner(joinPath(this.basePath, prefix), this.defaults));
    }

    setDefaultEndpoint(method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS", handler: RouteHandler): void {
        this.defaults.set(`${method} ${this.basePath}`, handler);
    }

    defaultHandler(method: string, prefix: string): RouteHandler {
        const handler = this.defaults.get(`${method} ${prefix}`);
        if (!handler) {
            throw new Error(`missing captured handler: ${method} ${prefix}`);
        }
        return handler;
    }
}

export async function mountPage(options: {
    content: string;
    auth?: Authentication;
    pageId?: string;
    pagePath?: string;
    siteVisible?: boolean;
    systemPages?: Partial<Pick<TSystem["site"], "notFound" | "forbidden" | "serverError" | "login">>;
}): Promise<{ handler: RouteHandler }> {
    const runner = new CaptureRunner();
    const cache = new InMemoryCache();
    cache.set(CMS_CACHE_KEYS.js("/.cms/assets/bloc-runtime.js"), compress("bloc-runtime", "text/javascript"));
    cache.set(CMS_CACHE_KEYS.js("/.cms/assets/cms-binding-core.js"), compress("binding", "text/javascript"));
    cache.set(CMS_CACHE_KEYS.STYLE, compress("body{}", "text/css"));
    const repository = pageRepository(
        options.content,
        options.systemPages,
        options.siteVisible,
        options.pageId,
        options.pagePath,
    );
    const content = createContentReader(repository);
    const pageExecution = new PageExecutionService({
        siteId: "site-a",
        content,
        authority: unusedAuthority,
        resolveCapability: async (contractId, capabilityId) => {
            if (contractId !== "shop") {
                return null;
            }
            if (capabilityId === "restricted") {
                return { access: "admin", version: "1.0.0" };
            }
            if (capabilityId === "my-products" || capabilityId === "create-order") {
                return { access: "authenticated", version: "1.0.0" };
            }
            return capabilityId === "list-products" ? { access: "public", version: "1.0.0" } : null;
        },
    });
    new KernelCms({
        runner,
        content: {
            ...content,
            resolvePageReference: async (reference) => {
                if (reference.kind === "contribution" && reference.pageId === "login") {
                    return "/login";
                }
                return content.resolvePageReference(reference);
            },
        },
        cache,
        capabilityGateway: {
            siteId: "site-a",
            invoker: shopInvoker,
            isAdministrator: async () => false,
        },
        pageExecution,
        authentication: options.auth ?? authSubject(null),
    });
    return { handler: runner.defaultHandler("GET", "/") };
}

const unusedAuthority: PageExecutionAuthority = {
    activate: async () => {
        throw new Error("not used by the Page access fixture");
    },
    authorize: async () => {
        throw new Error("not used by the Page access fixture");
    },
};

const shopInvoker: GatewayInvoker = {
    resolveHttp: async ({ path }) => ({
        capability: { id: path.split("/").filter(Boolean).at(-1) ?? "unknown" },
        binding: {},
        pathValues: {},
    }),
    invoke: async () => ({ kind: "success", status: 200, requestId: "test", output: {} }),
};

export function authSubject(subject: { identifier: string } | null): Authentication {
    return {
        loginUrl: "/login",
        logoutUrl: "/logout",
        profileUrl: "/profile",
        buildLoginUrl: (returnTo: string) => `/login?returnTo=${encodeURIComponent(returnTo)}`,
        buildLogoutUrl: (returnTo: string) => `/logout?returnTo=${encodeURIComponent(returnTo)}`,
        getSubject: async () => subject,
    };
}

function pageRepository(
    content: string,
    systemPages: Partial<Pick<TSystem["site"], "notFound" | "forbidden" | "serverError" | "login">> = {},
    siteVisible = true,
    pageId = "products",
    pagePath = "/products",
): CmsRepository {
    const page: TPage = {
        id: pageId,
        path: pagePath,
        title: "Products",
        description: "",
        content,
        visible: true,
        tags: [],
    };
    return {
        getPublishedPage: async () => page,
        getPublishedPageById: async (id) =>
            id === page.id ? page : id === "sign-in" ? { ...page, path: "/sign-in" } : null,
        getPublishedPages: async () => [page],
        resolvePublishedRoute: async () => null,
        getPageRoute: async () => null,
        getBlocsList: async () => [],
        getBlocViewJS: async () => null,
        getSystem: async () => ({ ...system, site: { ...system.site, visible: siteVisible, ...systemPages } }),
    } as unknown as CmsRepository;
}

function joinPath(base: string, path: string): string {
    const joined = `/${base}/${path}`.replace(/\/+/g, "/");
    return joined.length > 1 && joined.endsWith("/") ? joined.slice(0, -1) : joined;
}
