import { expect, test } from "bun:test";
import { InMemoryDashboardAssignmentRepository, InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import type { ControlCms } from "cms-control/ControlCms";
import myDashboards from "cms-control/api/_workspace/my-dashboards.get";
import type { Dashboard } from "cms-control/components/admin/Resources/Dashboards/domain/types";
import { DashboardNav } from "cms-control/components/admin/Resources/Dashboards/navigation/DashboardNav";
import { renderRuntimeNavigation } from "cms-control/components/admin/Resources/Dashboards/navigation/runtime";

test("dashboard navigation keeps authored icons and uses the common Explore icon", () => {
    document.head.innerHTML = '<meta name="basePath" content="">';
    const navigation = new DashboardNav();
    navigation.render(
        [
            dashboard({ id: "private", name: "Private", icon: "users" }),
            dashboard({
                id: "collection",
                name: "Collection",
                icon: "database",
                origin: {
                    kind: "collection",
                    publisherId: "ulvia.official",
                    collectionId: "test",
                    dashboardId: "starter",
                },
                collectionName: "Test",
            }),
        ],
        "",
        false,
    );

    const icons = Array.from(navigation.shadowRoot!.querySelectorAll("cms-library-icon")).map((icon) =>
        icon.getAttribute("name"),
    );
    expect(icons).toEqual(["compass", "users", "database"]);
});

test("dashboard runtime navigation renders view icons at primary and tab levels", () => {
    document.body.innerHTML = `
        <div data-primary-navigation></div>
        <w13c-lateral-menu data-secondary-navigation><span data-secondary-title></span></w13c-lateral-menu>
        <span data-secondary-mobile-label></span>
        <p9r-nav-tabs data-dashboard-tabs></p9r-nav-tabs>
    `;
    renderRuntimeNavigation(
        "dashboard",
        [
            {
                id: "workspace",
                label: "Workspace",
                icon: "grid",
                childPlacement: "tabs",
                children: [
                    { id: "overview", label: "Overview", icon: "star", use: "test:overview" },
                    { id: "resources", label: "Resources", icon: "package", use: "test:resources" },
                ],
            },
        ],
        "test:overview",
    );

    expect(document.querySelector("[data-primary-navigation] cms-library-icon")?.getAttribute("name")).toBe("grid");
    expect(
        Array.from(document.querySelectorAll("[data-dashboard-tabs] cms-library-icon")).map((icon) =>
            icon.getAttribute("name"),
        ),
    ).toEqual(["star", "package"]);
});

test("member dashboard responses retain the private dashboard icon", async () => {
    const dashboards = new InMemoryDashboardRepository();
    const dashboardAssignments = new InMemoryDashboardAssignmentRepository();
    await dashboards.create({
        id: "private",
        siteId: "site",
        name: "Private",
        icon: "users",
        enabled: true,
        revision: 1,
        mounts: [{ collectionId: "test", viewId: "overview", label: "Overview" }],
    });
    await dashboardAssignments.assign({ subjectId: "member", dashboardId: "private" });
    const cms = {
        auth: { getSubject: async () => ({ identifier: "member" }) },
        dashboards,
        dashboardAssignments,
        config: {
            collections: {
                siteId: "site",
                store: { snapshot: async () => ({ collections: [] }) },
            },
        },
    } as unknown as ControlCms;

    const response = await myDashboards(new Request("http://localhost/api/my-dashboards"), cms);
    const body = (await response.json()) as { dashboards: Dashboard[] };

    expect(body.dashboards).toHaveLength(1);
    expect(body.dashboards[0]?.icon).toBe("users");
});

function dashboard(overrides: Partial<Dashboard>): Dashboard {
    return {
        id: "dashboard",
        siteId: "site",
        name: "Dashboard",
        enabled: false,
        revision: 1,
        mounts: [],
        members: [],
        ...overrides,
    };
}
