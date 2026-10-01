import { expect, test } from "bun:test";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { InMemoryDashboardAssignmentRepository, InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import type { ControlCms } from "cms-control/ControlCms";
import dashboardContext from "cms-control/api/_workspace/dashboard-context.get";
import changeDashboardMember from "cms-control/api/_workspace/dashboard-members.post";
import updateDashboard from "cms-control/api/_workspace/dashboard.post";
import readDashboardView from "cms-control/api/_workspace/dashboard-view.get";
import type { Dashboard } from "cms-control/components/admin/Resources/Dashboards/domain/types";
import { rewriteDashboardCapabilitySources } from "cms-control/components/admin/Resources/Dashboards/DashboardView";
import { DashboardWorkspaceView } from "cms-control/components/admin/Resources/Dashboards/management/DashboardWorkspaceView";
import { dashboardCatalog } from "cms-control/core/admin/dashboards/catalog";

test("an official collection dashboard keeps access and identity through an upgrade", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const dashboards = new InMemoryDashboardRepository();
    const assignments = new InMemoryDashboardAssignmentRepository();
    let subject = "admin";
    const cms = {
        auth: { getSubject: async () => ({ identifier: subject }) },
        config: {
            administrator: async (candidate: { identifier: string }) => candidate.identifier === "admin",
            collections: { siteId: "site", store },
        },
        dashboards,
        dashboardAssignments: assignments,
        users: { getBySub: async (id: string) => (id === "member" ? { sub: id } : null) },
    } as unknown as ControlCms;

    const first = await store.importRelease(release("1.0.0", "Initial"));
    await store.install("site", first.digest, 0, "local");
    const [initial] = await dashboardCatalog(cms);
    expect(initial).toMatchObject({ name: "Ulvia workspace Initial", enabled: false, revision: 0 });

    subject = "member";
    await expect(view(cms, initial!.id)).rejects.toMatchObject({ status: 403 });
    subject = "admin";
    expect((await view(cms, initial!.id)).status).toBe(200);

    await updateDashboard(jsonRequest("/api/dashboard", { id: initial!.id, revision: 0, enabled: true }), cms);
    subject = "outsider";
    await expect(view(cms, initial!.id)).rejects.toMatchObject({ status: 403 });
    subject = "admin";
    await changeDashboardMember(
        jsonRequest("/api/dashboard-members", {
            dashboardId: initial!.id,
            subjectId: "member",
            action: "assign",
        }),
        cms,
    );

    subject = "member";
    const activeView = await view(cms, initial!.id);
    expect((await activeView.json()) as { html: string }).toMatchObject({
        html: "<section><h2>Initial</h2></section>",
    });
    const context = await dashboardContext(
        new Request(`http://localhost/api/dashboard-context?dashboardId=${initial!.id}`),
        cms,
    );
    expect(await context.json()).toEqual({ name: "Ulvia workspace Initial", viewCount: 3 });

    const second = await store.importRelease(release("1.1.0", "Updated"));
    await store.upgrade("site", second.digest, 1, "local");
    const [upgraded] = await dashboardCatalog(cms);
    expect(upgraded).toMatchObject({ id: initial!.id, name: "Ulvia workspace Updated", enabled: true, revision: 1 });
    expect(await assignments.hasAssignment("member", upgraded!.id)).toBeTrue();
    const upgradedView = await view(cms, upgraded!.id);
    expect((await upgradedView.json()) as { html: string }).toMatchObject({
        html: "<section><h2>Updated</h2></section>",
    });

    subject = "admin";
    await updateDashboard(jsonRequest("/api/dashboard", { id: upgraded!.id, revision: 1, enabled: false }), cms);
    subject = "member";
    await expect(view(cms, upgraded!.id)).rejects.toMatchObject({ status: 403 });
});

test("saving a private dashboard updates its fields without rebuilding the workspace", () => {
    const root = document.createElement("div");
    root.innerHTML = `
        <a data-back></a>
        <span data-editor-title>Before</span>
        <input data-name value="Before">
        <a data-private-open></a>
        <span data-dirty></span>
        <button data-save>Saving…</button>
        <div data-stable-node></div>
    `;
    const stableNode = root.querySelector("[data-stable-node]");
    const nameField = root.querySelector("[data-name]");
    const view = new DashboardWorkspaceView(root);
    view.finishPrivateSave({
        id: "private",
        siteId: "site",
        name: "After",
        icon: "layout",
        enabled: true,
        revision: 2,
        mounts: [{ collectionId: "ulvia-official", viewId: "overview", label: "Overview" }],
        members: [],
    } satisfies Dashboard);

    expect(root.querySelector("[data-stable-node]")).toBe(stableNode);
    expect(root.querySelector("[data-name]")).toBe(nameField);
    expect((nameField as HTMLInputElement).value).toBe("After");
    expect(root.querySelector("[data-editor-title]")?.textContent).toBe("After");
    expect(root.querySelector("[data-dirty]")?.hasAttribute("hidden")).toBeTrue();
});

test("dashboard HTML routes declared capability sources through its scoped gateway", () => {
    const root = document.createElement("div");
    root.innerHTML = `
        <section cms-source="/.cms/call/catalog.items/item.list as catalog"></section>
        <section cms-source="/api/dashboard-context as dashboard"></section>
    `;

    rewriteDashboardCapabilitySources(root, "dashboard one", "/cms");

    expect(root.children[0]!.getAttribute("cms-source")).toBe(
        "/cms/api/dashboard-call/catalog.items/item.list?dashboardId=dashboard%20one as catalog",
    );
    expect(root.children[1]!.getAttribute("cms-source")).toBe("/api/dashboard-context as dashboard");
});

function view(cms: ControlCms, dashboardId: string): Promise<Response> {
    return readDashboardView(
        new Request(`http://localhost/api/dashboard-view?dashboardId=${dashboardId}&viewId=ulvia-official%3Aoverview`),
        cms,
    );
}

function jsonRequest(path: string, body: unknown): Request {
    return new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

function release(version: string, marker: string): Record<string, unknown> {
    return {
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId: "ulvia-official",
        publisherId: "ulvia.official",
        version,
        name: "Ulvia Official",
        locale: "en",
        assets: [],
        blocs: [
            {
                kind: "composition",
                id: "ulvia-official-page",
                lightdom: "<section><p>Ulvia</p></section>",
                uses: [],
                requires: [],
                slots: {},
            },
        ],
        views: [
            { id: "overview", name: "Overview", icon: "layout", html: `<section><h2>${marker}</h2></section>` },
            { id: "resources", name: "Blocs", icon: "grid", html: "<section><h2>Blocs</h2></section>" },
            { id: "theme", name: "Theme", icon: "settings", html: "<section><h2>Theme</h2></section>" },
        ],
        dashboards: [
            {
                id: "starter",
                name: `Ulvia workspace ${marker}`,
                icon: "layout",
                navigation: [
                    {
                        id: "workspace",
                        label: "Ulvia",
                        childPlacement: "lateral",
                        children: [
                            { id: "overview", label: "Overview", use: "overview" },
                            {
                                id: "resources",
                                label: "Resources",
                                childPlacement: "tabs",
                                children: [
                                    { id: "blocs", label: "Blocs", use: "resources" },
                                    { id: "theme", label: "Theme", use: "theme" },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    };
}
