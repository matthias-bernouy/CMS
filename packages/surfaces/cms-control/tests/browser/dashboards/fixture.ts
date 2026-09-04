import type { Page } from "playwright";
import type { DashboardDefinition } from "@bernouy/cms-dashboards";

type Dashboard = DashboardDefinition;

export type DashboardBrowserFixture = {
    requests: Array<{ method: string; path: string; at: number }>;
    assignmentChanges: Array<{ dashboardId: string; subjectId: string; assigned: boolean }>;
    dashboardCreations: Array<{ id: string; name: string; icon: string }>;
};

export async function installDashboardRoutes(page: Page): Promise<DashboardBrowserFixture> {
    const requests: DashboardBrowserFixture["requests"] = [];
    const assignmentChanges: DashboardBrowserFixture["assignmentChanges"] = [];
    const dashboardCreations: DashboardBrowserFixture["dashboardCreations"] = [];
    const site = [dashboard("support", "Support", "users", "published", { kind: "site", createdBy: "admin-1" })];
    const integration = dashboard("commerce", "Commerce", "shopping-bag", "published", {
        kind: "integration",
        integrationId: "commerce",
        version: "1.0.0",
    });
    const assignments = new Map<string, Set<string>>([["support", new Set(["operator-1"])]]);
    const users = [
        { sub: "operator-1", email: "support@example.com" },
        { sub: "operator-2", email: "marketing@example.com" },
    ];
    await page.route("http://cms.test/**", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        requests.push({ method: request.method(), path: `${url.pathname}${url.search}`, at: performance.now() });
        if (request.resourceType() === "document") {
            await route.fulfill({ contentType: "text/html", body: "<!doctype html>" });
            return;
        }
        if (url.pathname === "/api/dashboard-management") {
            await route.fulfill({ json: management(site, integration, url.searchParams.get("id") ?? "") });
            return;
        }
        if (url.pathname === "/api/users") {
            await route.fulfill({ json: users });
            return;
        }
        if (url.pathname === "/api/dashboard-session") {
            await route.fulfill({
                json: {
                    subject: { id: "operator-1", role: "user", email: "support@example.com" },
                    logoutUrl: "/auth/logout?returnTo=%2Fdashboards",
                    dashboards: [site[0], integration],
                },
            });
            return;
        }
        if (url.pathname === "/api/dashboard-session/dashboard") {
            await route.fulfill({ json: runtime(url.searchParams.get("id") ?? "") });
            return;
        }
        if (url.pathname === "/api/dashboard-session/profile") {
            await route.fulfill({
                json: {
                    logoutUrl: "/auth/logout?returnTo=%2Fdashboards",
                    email: "support@example.com",
                    role: "user",
                    roleLabel: "User",
                    provider: "local",
                    passwordCard: [{}],
                },
            });
            return;
        }
        if (url.pathname === "/api/dashboard-session/profile/password") {
            await route.fulfill({ json: { ok: true } });
            return;
        }
        if (url.pathname === "/api/dashboard-management/assignments" && request.method() === "GET") {
            const id = url.searchParams.get("id") ?? "";
            const assigned = assignments.get(id) ?? new Set<string>();
            await route.fulfill({
                json:
                    url.searchParams.get("summary") === "true"
                        ? assignmentSummary(id, assigned.size)
                        : assignmentView(id, users, assigned, url.searchParams),
            });
            return;
        }
        if (
            url.pathname === "/api/dashboard-management/assignments" &&
            (request.method() === "POST" || request.method() === "DELETE")
        ) {
            const input = request.postDataJSON() as { dashboardId: string; subjectId: string; assigned?: boolean };
            const body = {
                dashboardId: input.dashboardId,
                subjectId: input.subjectId,
                assigned: request.method() === "DELETE" ? false : (input.assigned ?? true),
            };
            const values = assignments.get(body.dashboardId) ?? new Set<string>();
            body.assigned ? values.add(body.subjectId) : values.delete(body.subjectId);
            assignments.set(body.dashboardId, values);
            assignmentChanges.push(body);
            await route.fulfill({ json: body });
            return;
        }
        if (url.pathname === "/api/dashboard-management/create") {
            const body = request.postDataJSON() as {
                id: string;
                name: string;
                icon: string;
            };
            dashboardCreations.push(body);
            const created = dashboard(body.id, body.name, body.icon, "published", {
                kind: "site",
                createdBy: "admin-1",
            });
            created.views = [];
            created.homeView = "";
            site.push(created);
            await route.fulfill({ status: 201, json: created });
            return;
        }
        if (url.pathname === "/api/dashboard-management/update" && request.method() === "PUT") {
            const body = request.postDataJSON() as {
                id: string;
                name: string;
                icon: string;
                views: Dashboard["views"] | string;
            };
            const updated = site.find((item) => item.id === body.id)!;
            const views = typeof body.views === "string" ? (JSON.parse(body.views) as Dashboard["views"]) : body.views;
            updated.meta = { name: body.name, icon: body.icon };
            updated.views = views;
            updated.homeView = firstLeafPath(views);
            updated.status = "published";
            updated.revision = String(Number(updated.revision) + 1);
            await route.fulfill({ json: updated });
            return;
        }
        if (url.pathname === "/api/dashboard-management/publish") {
            const body = request.postDataJSON() as { id: string };
            const published = site.find((item) => item.id === body.id)!;
            published.status = "published";
            published.revision = "2";
            await route.fulfill({ json: published });
            return;
        }
        if (url.pathname === "/api/dashboard-management/delete") {
            const index = site.findIndex((item) => item.id === url.searchParams.get("id"));
            site.splice(index, 1);
            await route.fulfill({ status: 204, body: "" });
            return;
        }
        if (url.pathname === "/api/system/settings") {
            await route.fulfill({
                json: { site: { name: "Marketplace" }, theme: { activeThemeId: "", sources: [], themes: [] } },
            });
            return;
        }
        await route.fulfill({ json: [] });
    });
    return { requests, assignmentChanges, dashboardCreations };
}

function firstLeafPath(views: Dashboard["views"], parent = ""): string {
    const first = views[0];
    if (!first) {
        return "";
    }
    const path = parent ? `${parent}/${first.id}` : first.id;
    return first.use || !first.children?.length ? path : firstLeafPath(first.children, path);
}

function management(site: Dashboard[], integration: Dashboard, requestedId: string) {
    const availableViews = [
        {
            schemaVersion: 2,
            id: "commerce/orders",
            source: "commerce",
            meta: { name: "Orders", icon: "receipt" },
            view: { id: "orders", label: "Integration orders", widgets: [] },
            availability: { catalog: true },
        },
        {
            schemaVersion: 2,
            id: "commerce/unsafe",
            source: "commerce",
            meta: { name: "<img src=x onerror=alert(1)>" },
            view: { id: "unsafe", label: "Unsafe", widgets: [] },
            availability: { catalog: true },
        },
    ];
    const selected = [...site, integration].find((item) => item.id === requestedId) ?? site[0] ?? integration;
    const navigationItem = (item: Dashboard) => ({
        id: item.id,
        name: item.meta.name,
        icon: item.meta.icon ?? "layout",
        svg: item.meta.svg ?? "",
        selected: item.id === selected.id,
    });
    return {
        site: site.map(navigationItem),
        integrations: [navigationItem(integration)],
        selected: [
            {
                id: selected.id,
                name: selected.meta.name,
                icon: selected.meta.icon ?? "layout",
                svg: selected.meta.svg ?? "",
                ownerLabel: selected.origin.kind === "site" ? "Site" : "commerce 1.0.0",
                navigation: selected.views,
                availableViews,
                openActions: [{}],
                editable: selected.origin.kind === "site",
                managed: selected.origin.kind === "integration",
            },
        ],
        emptyState: [],
    };
}

function assignmentView(
    dashboardId: string,
    users: Array<{ sub: string; email: string }>,
    assigned: ReadonlySet<string>,
    params: URLSearchParams,
) {
    const search = params.get("search")?.trim().toLocaleLowerCase() ?? "";
    const limit = Number(params.get("limit")) || 25;
    const requestedPage = Number(params.get("page")) || 1;
    const matches = search ? users.filter((user) => user.email.toLocaleLowerCase() === search) : users;
    const pageCount = Math.max(1, Math.ceil(matches.length / limit));
    const page = Math.min(requestedPage, pageCount);
    const items = matches.slice((page - 1) * limit, page * limit);
    return {
        ...assignmentSummary(dashboardId, assigned.size),
        page,
        pageCount,
        total: matches.length,
        hasMultiplePages: pageCount > 1,
        items: items.map((user) => ({
            subjectId: user.sub,
            name: user.email,
            email: user.email,
            assigned: assigned.has(user.sub),
            assignedActions: assigned.has(user.sub) ? [{ dashboardId, subjectId: user.sub }] : [],
            availableActions: assigned.has(user.sub) ? [] : [{ dashboardId, subjectId: user.sub }],
        })),
    };
}

function assignmentSummary(dashboardId: string, count: number) {
    return {
        dashboardId,
        count,
        memberLabel: count === 1 ? "member" : "members",
    };
}

function dashboard(
    id: string,
    name: string,
    icon: string,
    status: "draft" | "published",
    origin: DashboardDefinition["origin"],
): DashboardDefinition {
    return {
        schemaVersion: 2 as const,
        id,
        meta: { name, icon },
        homeView: "operations/support/orders",
        views: [
            {
                id: "orders",
                label: "Orders",
                icon: "receipt",
                use: "commerce/orders",
                revision: "1.0.0:commerce/orders",
            },
        ],
        origin,
        status,
        revision: "1",
    };
}

function runtime(id: string) {
    const views =
        id === "commerce"
            ? [
                  {
                      id: "orders",
                      label: "Order queue",
                      icon: "search",
                      source: "commerce",
                      widgets: [],
                      children: [],
                  },
              ]
            : [
                  {
                      id: "operations",
                      label: "Operations",
                      icon: "package",
                      widgets: [],
                      children: [
                          {
                              id: "support",
                              label: "Support",
                              icon: "users",
                              widgets: [],
                              children: [
                                  {
                                      id: "orders",
                                      label: "Orders",
                                      icon: "receipt",
                                      source: "commerce",
                                      widgets: [],
                                      children: [],
                                  },
                              ],
                          },
                      ],
                  },
              ];
    return {
        dashboard: {
            ...dashboard(id, id === "support" ? "Support" : "Commerce", "layout", "published", {
                kind: "site",
                createdBy: "admin-1",
            }),
            homeView: id === "commerce" ? "orders" : "operations/support/orders",
            views,
        },
        groups: [{ source: { id: "commerce", name: "Commerce" }, endpoints: [], dashboards: [] }],
    };
}
