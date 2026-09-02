import { InMemoryAuthentication, InMemoryUsersRepository, type Authentication } from "@bernouy/cms-auth";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import {
    DASHBOARD_SCHEMA_VERSION,
    InMemoryDashboardAssignmentRepository,
    InMemoryDashboardRepository,
    InMemoryDashboardViewRepository,
    normalizeLegacyDashboardView,
} from "@bernouy/cms-dashboards";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import type { Middleware, RouteHandler } from "@bernouy/http-runner";
import { ControlCms } from "cms-control/ControlCms";
import type { CMS_ROLES } from "types/roles";
import { CaptureRunner } from "../../access/authPublicSupport";

export async function mounted(
    role: CMS_ROLES | null,
    assigned: boolean,
    access: "admin" | "system" = "admin",
    totalUsers = 1,
) {
    const runner = CaptureRunner.withoutFileApi();
    const dashboards = new InMemoryDashboardRepository();
    const dashboardViews = new InMemoryDashboardViewRepository();
    const dashboardAssignments = new InMemoryDashboardAssignmentRepository();
    const sources = new InMemorySourceRepository();
    await sources.createSource({
        urn: "urn:commerce",
        endpoints: [
            {
                urn: "urn:commerce:listOrders",
                method: "GET",
                targetUrl: "https://upstream.invalid/orders",
                access: { mode: access },
            },
            {
                urn: "urn:commerce:updateOrders",
                method: "POST",
                targetUrl: "https://upstream.invalid/orders",
                access: { mode: access },
            },
        ],
    });
    await dashboardViews.createView({
        ...normalizeLegacyDashboardView({
            id: "orders",
            source: "commerce",
            views: [
                {
                    widget: "w-table",
                    id: "orders",
                    source: { endpoint: "listOrders", itemsPath: "items" },
                    rowKey: "id",
                    columns: [{ id: "id", label: "ID", path: "id" }],
                },
            ],
        }),
        revision: "view-1",
    });
    await dashboards.createDashboard({
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
        id: "support",
        meta: { name: "Support" },
        homeView: "orders",
        views: [{ id: "orders", use: "orders", revision: "view-1" }],
        origin: { kind: "site", createdBy: "admin-1" },
        status: "published",
        revision: "2",
        executionPlan: {
            dashboardId: "support",
            revision: "2",
            allowedCalls: [
                { sourceId: "commerce", endpointId: "listOrders", method: "GET" },
                { sourceId: "commerce", endpointId: "updateOrders", method: "POST" },
            ],
        },
    });
    if (assigned) {
        await dashboardAssignments.assign({ subjectId: "operator-1", dashboardId: "support" });
    }
    const auth = role
        ? new InMemoryAuthentication<CMS_ROLES>({ role, identifier: "operator-1" })
        : new AnonymousAuthentication();
    const users = new InMemoryUsersRepository<CMS_ROLES>();
    if (role) {
        await users.upsert({ sub: "operator-1", email: "operator@example.com", provider: "oidc" }, role);
        for (let index = 2; index <= totalUsers; index += 1) {
            await users.upsert(
                { sub: `operator-${index}`, email: `operator-${index}@example.com`, provider: "oidc" },
                "user",
            );
        }
    }
    const cms = new ControlCms(
        runner,
        new InMemoryCmsRepository(),
        auth,
        {
            dashboards,
            dashboardViews,
            dashboardAssignments,
            sourceImageInterceptor: async (_endpoint, _request, _next) => Response.json({ items: [] }),
        },
        undefined,
        undefined,
        undefined,
        undefined,
        users,
        undefined,
        undefined,
        undefined,
        sources,
        undefined,
        new InMemoryRolesRepository(),
    );
    await cms.ready;
    return {
        cms,
        request: async (method: string, path: string, init?: RequestInit) =>
            await capturedRequest(runner, method, path, init),
        status: async (method: string, path: string) => (await capturedRequest(runner, method, path)).status,
    };
}

async function capturedRequest(
    runner: CaptureRunner,
    method: string,
    path: string,
    init: RequestInit = {},
): Promise<Response> {
    const pathname = new URL(path, "http://localhost").pathname;
    const route = pathname.startsWith("/.cms/dashboards/")
        ? `/.cms/dashboards`
        : pathname.startsWith("/.cms/sources/")
          ? `/.cms/sources`
          : pathname;
    const key = `${method} ${route}`;
    const handler = runner.handlers.get(key);
    if (!handler) {
        throw new Error(`missing captured route ${key}`);
    }
    const request = new Request(`http://localhost${path}`, { ...init, method });
    return await runMiddleware(request, handler, runner.middlewareChains.get(key) ?? []);
}

async function runMiddleware(request: Request, handler: RouteHandler, chain: Middleware[]): Promise<Response> {
    let next = async (): Promise<Response> => await handler(request);
    for (const middleware of [...chain].reverse()) {
        const downstream = next;
        next = async () => await middleware(request, downstream);
    }
    return await next();
}

class AnonymousAuthentication implements Authentication<CMS_ROLES> {
    readonly loginUrl = "/login";
    readonly logoutUrl = "/logout";
    readonly profileUrl = "/profile";
    buildLoginUrl() {
        return this.loginUrl;
    }
    buildLogoutUrl() {
        return this.logoutUrl;
    }
    async getSubject() {
        return null;
    }
}
