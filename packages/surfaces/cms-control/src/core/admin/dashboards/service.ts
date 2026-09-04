import {
    DASHBOARD_SCHEMA_VERSION,
    compileDashboardExecutionPlan,
    resolveDashboardViews,
    validateDashboardStructure,
    type DashboardDefinition,
    type DashboardViewDefinition,
    type DashboardViewMount,
} from "@bernouy/cms-dashboards";
import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import type { DashboardInput } from "./input";

export async function createSiteDashboard(
    cms: ControlCms,
    input: DashboardInput,
    createdBy: string,
): Promise<DashboardDefinition> {
    if (await cms.dashboards.getDashboard(input.id)) {
        throw new InvalidParam("id", "already exists.");
    }
    const views = await cms.dashboardViews.getAllViews();
    const candidate: DashboardDefinition = {
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
        id: input.id,
        meta: { name: input.name, icon: input.icon },
        homeView: input.homeView,
        views: pinViews(input.views, views),
        origin: { kind: "site", createdBy },
        status: "published",
        revision: "1",
    };
    return await cms.dashboards.createDashboard(await compileDashboard(cms, candidate, views));
}

export async function updateSiteDashboard(
    cms: ControlCms,
    id: string,
    input: DashboardInput,
): Promise<DashboardDefinition> {
    const previous = await requiredSiteDashboard(cms, id);
    if (input.id !== id) {
        throw new InvalidParam("id", "cannot be changed.");
    }
    const views = await cms.dashboardViews.getAllViews();
    const candidate: DashboardDefinition = {
        ...previous,
        meta: { ...previous.meta, name: input.name, icon: input.icon },
        homeView: input.homeView,
        views: pinViews(input.views, views),
        status: "published",
        revision: nextRevision(previous.revision),
        executionPlan: undefined,
    };
    const dashboard = await compileDashboard(cms, candidate, views);
    return (await cms.dashboards.updateDashboard(dashboard))!;
}

export async function publishSiteDashboard(cms: ControlCms, id: string): Promise<DashboardDefinition> {
    const previous = await requiredSiteDashboard(cms, id);
    const views = await cms.dashboardViews.getAllViews();
    const revision = nextRevision(previous.revision);
    const candidate = {
        ...previous,
        views: pinViews(previous.views, views),
        status: "published" as const,
        revision,
        executionPlan: undefined,
    };
    const published = await compileDashboard(cms, candidate, views);
    return (await cms.dashboards.updateDashboard(published))!;
}

export async function deleteSiteDashboard(cms: ControlCms, id: string): Promise<boolean> {
    await requiredSiteDashboard(cms, id);
    const deleted = await cms.dashboards.deleteDashboard(id);
    if (deleted) {
        await cms.dashboardAssignments.deleteForDashboard(id);
    }
    return deleted;
}

async function requiredSiteDashboard(cms: ControlCms, id: string): Promise<DashboardDefinition> {
    const dashboard = await cms.dashboards.getDashboard(id);
    if (!dashboard) {
        throw new InvalidParam("id", "does not identify a dashboard.");
    }
    if (dashboard.origin.kind !== "site") {
        throw new InvalidParam("id", "identifies an integration-managed dashboard.");
    }
    return dashboard;
}

function pinViews(mounts: DashboardViewMount[], views: DashboardViewDefinition[]): DashboardViewMount[] {
    const byId = new Map(views.map((view) => [view.id, view]));
    return mounts.map((mount) => {
        const view = mount.use ? byId.get(mount.use) : undefined;
        return {
            ...structuredClone(mount),
            label: mount.label ?? view?.meta.name ?? view?.view.label ?? mount.id,
            icon: mount.icon ?? view?.meta.icon ?? view?.view.icon ?? "layout",
            ...(view?.revision ? { revision: view.revision } : {}),
            ...(mount.children ? { children: pinViews(mount.children, views) } : {}),
        };
    });
}

function assertResolvable(dashboard: DashboardDefinition, views: DashboardViewDefinition[]) {
    const errors = validateDashboardStructure(dashboard);
    const resolved = resolveDashboardViews(dashboard, views);
    errors.push(...resolved.errors);
    if (errors.length || !resolved.dashboard) {
        throw new InvalidParam("dashboard", errors.join("; "));
    }
    return resolved.dashboard;
}

async function compileDashboard(
    cms: ControlCms,
    dashboard: DashboardDefinition,
    views: DashboardViewDefinition[],
): Promise<DashboardDefinition> {
    const resolved = assertResolvable(dashboard, views);
    const compiled = await compileDashboardExecutionPlan(resolved, cms.sources);
    if (!compiled.plan || compiled.errors.length) {
        throw new InvalidParam("dashboard", compiled.errors.join("; "));
    }
    return { ...dashboard, executionPlan: compiled.plan };
}

function nextRevision(revision: string): string {
    const numeric = Number.parseInt(revision, 10);
    return Number.isSafeInteger(numeric) && numeric >= 0 ? String(numeric + 1) : crypto.randomUUID();
}
