import type { DashboardDefinition, DashboardViewDefinition } from "@bernouy/cms-dashboards";
import type { ControlCms } from "cms-control/ControlCms";

export type DashboardNavigationItem = {
    id: string;
    name: string;
    icon: string;
    svg: string;
    selected: boolean;
};

export type DashboardConfigurationView = {
    id: string;
    name: string;
    icon: string;
    svg: string;
    ownerLabel: string;
    navigation: DashboardDefinition["views"];
    availableViews: DashboardViewDefinition[];
    openActions: Array<Record<string, never>>;
    editable: boolean;
    managed: boolean;
};

export type DashboardManagementPresentation = {
    site: DashboardNavigationItem[];
    integrations: DashboardNavigationItem[];
    selected: DashboardConfigurationView[];
    emptyState: Array<Record<string, never>>;
};

export async function dashboardManagementPresentation(
    cms: ControlCms,
    requestedId: string,
): Promise<DashboardManagementPresentation> {
    const [dashboards, allViews] = await Promise.all([
        cms.dashboards.getAllDashboards(),
        cms.dashboardViews.getAllViews(),
    ]);
    const views = allViews
        .filter((view) => view.availability?.catalog !== false)
        .sort((left, right) => left.meta.name.localeCompare(right.meta.name));
    const site = dashboards.filter(isSiteDashboard).sort(byName);
    const integrations = dashboards.filter(isManagedDashboard).sort(byIntegrationThenName);
    const ordered = [...site, ...integrations];
    const selected = ordered.find((dashboard) => dashboard.id === requestedId) ?? ordered[0];

    return {
        site: site.map((dashboard) => navigationItem(dashboard, selected?.id)),
        integrations: integrations.map((dashboard) => navigationItem(dashboard, selected?.id)),
        selected: selected ? [configurationView(selected, views)] : [],
        emptyState: selected ? [] : [{}],
    };
}

function configurationView(
    dashboard: DashboardDefinition,
    availableViews: DashboardViewDefinition[],
): DashboardConfigurationView {
    return {
        id: dashboard.id,
        name: dashboard.meta.name,
        icon: dashboard.meta.icon ?? "layout",
        svg: dashboard.meta.svg ?? "",
        ownerLabel:
            dashboard.origin.kind === "site" ? "Site" : `${dashboard.origin.integrationId} ${dashboard.origin.version}`,
        navigation: dashboard.views,
        availableViews,
        openActions: dashboard.status === "published" ? [{}] : [],
        editable: dashboard.origin.kind === "site",
        managed: dashboard.origin.kind === "integration",
    };
}

function navigationItem(dashboard: DashboardDefinition, selectedId: string | undefined): DashboardNavigationItem {
    return {
        id: dashboard.id,
        name: dashboard.meta.name,
        icon: dashboard.meta.icon ?? "layout",
        svg: dashboard.meta.svg ?? "",
        selected: dashboard.id === selectedId,
    };
}

function isSiteDashboard(dashboard: DashboardDefinition): boolean {
    return dashboard.origin.kind === "site";
}

function isManagedDashboard(dashboard: DashboardDefinition): boolean {
    return dashboard.origin.kind === "integration";
}

function byName(left: DashboardDefinition, right: DashboardDefinition): number {
    return left.meta.name.localeCompare(right.meta.name);
}

function byIntegrationThenName(left: DashboardDefinition, right: DashboardDefinition): number {
    if (left.origin.kind !== "integration" || right.origin.kind !== "integration") {
        return byName(left, right);
    }
    return left.origin.integrationId.localeCompare(right.origin.integrationId) || byName(left, right);
}
