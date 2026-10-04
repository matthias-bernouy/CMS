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
        repository: {
            getBlocRecords: async () =>
                (await store.snapshot("site")).collections.flatMap((item) =>
                    item.release.blocs.map((bloc) => ({
                        tag: bloc.id,
                        artifact: {
                            id: bloc.id,
                            viewJS: bloc.kind === "component" ? (bloc.runtime?.viewJS ?? "") : "",
                            ...(bloc.kind === "composition" ? { compositionHTML: bloc.lightdom } : {}),
                        },
                    })),
                ),
            getBlocViewJS: async (tag: string) => {
                const bloc = (await store.snapshot("site")).collections
                    .flatMap((item) => item.release.blocs)
                    .find((candidate) => candidate.id === tag);
                return bloc?.kind === "component" ? (bloc.runtime?.viewJS ?? null) : null;
            },
            getSystem: async () => ({ site: { language: "en" } }),
        },
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
    const activePayload = (await activeView.json()) as { html: string; hasRuntime: boolean };
    expect(activePayload.html).toContain("<h2>Initial</h2>");
    expect(activePayload.html).toContain("Welcome Initial");
    expect(activePayload.html).toContain("<ulvia-official-helper>");
    expect(activePayload.hasRuntime).toBeTrue();
    const runtime = await readDashboardView(
        new Request(
            `http://localhost/api/dashboard-view?dashboardId=${initial!.id}&viewId=ulvia-official%3Aoverview&runtime=1`,
        ),
        cms,
    );
    expect(runtime.headers.get("content-type")).toContain("text/javascript");
    expect(await runtime.text()).toContain("ulvia-official-helper");
    const frenchView = await view(cms, initial!.id, "fr-FR,fr;q=0.9");
    expect(((await frenchView.json()) as { html: string }).html).toContain("Bienvenue Initial");
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
    expect(((await upgradedView.json()) as { html: string }).html).toContain("<h2>Updated</h2>");

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
        navigation: [{ id: "overview", label: "Overview", use: "ulvia-official:overview" }],
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

    rewriteDashboardCapabilitySources(root, "dashboard one", "ulvia-official:catalog", "/cms");

    expect(root.children[0]!.getAttribute("cms-source")).toBe(
        "/cms/api/dashboard-call/catalog.items/item.list?dashboardId=dashboard%20one&viewId=ulvia-official%3Acatalog as catalog",
    );
    expect(root.children[1]!.getAttribute("cms-source")).toBe("/api/dashboard-context as dashboard");
});

function view(cms: ControlCms, dashboardId: string, language?: string): Promise<Response> {
    return readDashboardView(
        new Request(`http://localhost/api/dashboard-view?dashboardId=${dashboardId}&viewId=ulvia-official%3Aoverview`, {
            headers: language ? { "Accept-Language": language } : undefined,
        }),
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
        name: "collection.name",
        locale: "en",
        translations: {
            en: {
                "bloc.page.label": "Page",
                "bloc.helper.label": "Helper",
                "collection.name": "Ulvia Official",
                "dashboard.starter.name": `Ulvia workspace ${marker}`,
                "nav.blocs": "Blocs",
                "nav.overview": "Overview",
                "nav.resources": "Resources",
                "nav.theme": "Theme",
                "nav.workspace": "Ulvia",
                "view.overview.name": "Overview",
                "view.resources.name": "Blocs",
                "view.theme.name": "Theme",
            },
            fr: {
                "bloc.page.label": "Page",
                "bloc.helper.label": "Assistant",
                "collection.name": "Ulvia Officiel",
                "dashboard.starter.name": `Espace Ulvia ${marker}`,
                "nav.blocs": "Blocs",
                "nav.overview": "Vue d’ensemble",
                "nav.resources": "Ressources",
                "nav.theme": "Thème",
                "nav.workspace": "Ulvia",
                "view.overview.name": "Vue d’ensemble",
                "view.resources.name": "Blocs",
                "view.theme.name": "Thème",
            },
        },
        texts: [
            {
                id: "welcome",
                values: { en: `Welcome ${marker}`, fr: `Bienvenue ${marker}` },
            },
        ],
        assets: [],
        blocs: [
            {
                kind: "component",
                id: "ulvia-official-helper",
                label: "bloc.helper.label",
                internal: true,
                shadowdom: "<span></span>",
                uses: [],
                requires: [],
                slots: {},
                runtime: {
                    viewJS: 'if (!customElements.get("ulvia-official-helper")) customElements.define("ulvia-official-helper", class extends HTMLElement {});',
                },
            },
            {
                kind: "composition",
                id: "ulvia-official-page",
                label: "bloc.page.label",
                lightdom: `<section><h2>${marker}</h2><ulvia-official-helper></ulvia-official-helper></section>`,
                uses: ["ulvia-official-helper"],
                requires: [],
                slots: {},
            },
        ],
        views: [
            {
                id: "overview",
                name: "view.overview.name",
                icon: "layout",
                html: "<section><p>{{ cms.i18n.ulvia-official.welcome }}</p><ulvia-official-page></ulvia-official-page></section>",
            },
            {
                id: "resources",
                name: "view.resources.name",
                icon: "grid",
                html: "<section><h2>Blocs</h2></section>",
            },
            {
                id: "theme",
                name: "view.theme.name",
                icon: "settings",
                html: "<section><h2>Theme</h2></section>",
            },
        ],
        dashboards: [
            {
                id: "starter",
                name: "dashboard.starter.name",
                icon: "layout",
                navigation: [
                    {
                        id: "workspace",
                        label: "nav.workspace",
                        childPlacement: "lateral",
                        children: [
                            { id: "overview", label: "nav.overview", use: "overview" },
                            {
                                id: "resources",
                                label: "nav.resources",
                                childPlacement: "tabs",
                                children: [
                                    { id: "blocs", label: "nav.blocs", use: "resources" },
                                    { id: "theme", label: "nav.theme", use: "theme" },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    };
}
