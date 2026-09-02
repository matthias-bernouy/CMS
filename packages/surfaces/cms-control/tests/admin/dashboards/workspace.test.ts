import { afterEach, describe, expect, test } from "bun:test";
import { DASHBOARD_SCHEMA_VERSION, type ResolvedDashboard } from "@bernouy/cms-dashboards";
import {
    mountDashboardRuntime,
    renderViewNavigation,
} from "cms-control/components/admin/DashboardWorkspace/workspace/view";
import {
    renderDashboardSwitcher,
    renderOperatorLevel,
    renderOperatorProfile,
} from "cms-control/components/admin/DashboardWorkspace/nav/operatorView";

afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.removeAttribute("data-dashboard-scope");
});

describe("dashboard workspace navigation", () => {
    test("renders only the third navigation level as horizontal tabs", () => {
        const root = shadowRoot();
        const selected = renderViewNavigation(root, resolvedDashboard(), "operations/support/orders");
        const rows = root.querySelectorAll(".tab-row");
        expect(selected).toBe("operations/support/orders");
        expect(rows).toHaveLength(1);
        expect(rows[0]!.querySelector('[aria-selected="true"]')?.textContent).toContain("Orders");
    });

    test("renders a flat dashboard switcher and the first two lateral levels", () => {
        const dashboard = resolvedDashboard();
        const switcher = navigationRoot();
        renderDashboardSwitcher(
            switcher,
            [dashboard, { ...dashboard, id: "marketing", meta: { name: "Marketing" } }],
            "support",
        );
        expect(switcher.querySelectorAll("[data-dashboard-switcher] option")).toHaveLength(2);
        expect((switcher.querySelector("[data-dashboard-switcher]") as HTMLElement & { value: string }).value).toBe(
            "support",
        );

        const primary = navigationRoot();
        renderOperatorLevel(primary, dashboard, "operations/support/orders", 1);
        expect(primary.querySelector("[data-view-path='operations']")?.textContent).toContain("Operations");
        const secondary = navigationRoot();
        renderOperatorLevel(secondary, dashboard, "operations/support/orders", 2);
        expect(secondary.querySelector("[data-view-path='operations/support']")?.textContent).toContain("Support");
        expect((secondary.host as HTMLElement).hidden).toBeFalse();
        expect(secondary.querySelector<HTMLElement>("[data-level-heading]")?.hidden).toBeTrue();
        expect(secondary.querySelector("[data-level-heading]")?.textContent).toBe("");

        const flat = { ...dashboard, views: [{ ...dashboard.views[0]!, children: [] }] };
        renderOperatorLevel(secondary, flat, "operations", 2);
        expect((secondary.host as HTMLElement).hidden).toBeTrue();
    });

    test("renders the authenticated profile navigation", () => {
        history.replaceState(null, "", "/dashboards/profile?id=support&view=operations%2Fsupport%2Forders");
        const root = navigationRoot();
        renderOperatorProfile(
            root,
            { id: "operator-1", role: "user", email: "support@example.com" },
            "support",
            "operations/support/orders",
        );

        const item = root.querySelector("[data-operator-profile-link]")!;
        expect(item.textContent).toContain("Profile");
        expect(item.getAttribute("href")).toBe("/dashboards/profile?id=support&view=operations%2Fsupport%2Forders");
        expect(item.hasAttribute("active")).toBeTrue();
        expect(root.querySelector("p9r-action-menu")).toBeNull();
    });

    test("uses the mounted View label and icon in the content header", () => {
        const root = runtimeRoot();
        let mountedMeta: Record<string, unknown> | undefined;
        const runtime = root.querySelector<HTMLElement & { setExternalContext(groups: unknown[]): void }>(
            "[data-runtime]",
        )!;
        runtime.setExternalContext = (groups) => {
            mountedMeta = (groups as Array<{ dashboards: Array<{ meta: Record<string, unknown> }> }>)[0]?.dashboards[0]
                ?.meta;
        };

        mountDashboardRuntime(
            root,
            "support",
            resolvedDashboard(),
            [
                {
                    source: {
                        urn: "urn:bernouy:cms:source:commerce",
                        id: "commerce",
                        name: "Commerce",
                        endpointCount: 0,
                        dashboardCount: 0,
                        readonly: false,
                    },
                    endpoints: [],
                    dashboards: [],
                },
            ],
            "operations/support/orders",
        );

        expect(mountedMeta).toEqual({ name: "Orders", icon: "receipt" });
    });

    test("falls back to the configured home leaf", () => {
        const root = shadowRoot();
        expect(renderViewNavigation(root, resolvedDashboard(), "missing/path")).toBe("operations/support/orders");
    });
});

function shadowRoot(): ShadowRoot {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const navigation = document.createElement("div");
    navigation.dataset.viewNavigation = "true";
    root.append(navigation);
    document.body.append(host);
    return root;
}

function navigationRoot(): ShadowRoot {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const admin = document.createElement("div");
    admin.dataset.adminMenu = "true";
    const switcher = document.createElement("div");
    switcher.dataset.dashboardSwitcherContainer = "true";
    const profile = document.createElement("div");
    profile.dataset.dashboardProfileContainer = "true";
    const operator = document.createElement("w13c-lateral-menu");
    operator.dataset.operatorNavigation = "true";
    const heading = document.createElement("span");
    heading.dataset.levelHeading = "true";
    const empty = document.createElement("div");
    empty.dataset.levelEmpty = "true";
    operator.append(heading, empty);
    root.append(admin, switcher, profile, operator);
    document.body.append(host);
    return root;
}

function runtimeRoot(): ShadowRoot {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const runtime = document.createElement("div");
    runtime.dataset.runtime = "true";
    root.append(runtime);
    document.body.append(host);
    return root;
}

function resolvedDashboard(): ResolvedDashboard {
    return {
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
        id: "support",
        meta: { name: "Support" },
        homeView: "operations/support/orders",
        views: [
            {
                id: "operations",
                label: "Operations",
                widgets: [],
                children: [
                    {
                        id: "support",
                        label: "Support",
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
        ],
        origin: { kind: "site", createdBy: "admin-1" },
        status: "published",
        revision: "2",
    };
}
