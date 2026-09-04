import type {
    DashboardDefinition,
    DashboardViewDefinition,
    DashboardViewMount,
    DashboardViewNode,
    ResolvedDashboard,
    ResolvedDashboardView,
} from "../../../interfaces/Dashboard";
import { DASHBOARD_MAX_VIEW_DEPTH } from "../../../interfaces/Dashboard";

export function resolveDashboardViews(
    dashboard: DashboardDefinition,
    availableViews: readonly DashboardViewDefinition[],
): { dashboard?: ResolvedDashboard; errors: string[] } {
    const byId = new Map(availableViews.map((view) => [view.id, view]));
    const errors: string[] = [];
    const views = dashboard.views.map((mount, index) => resolveMount(mount, `views.${index}`, 1, byId, errors));
    if (errors.length) {
        return { errors };
    }
    return { dashboard: { ...structuredClone(dashboard), views }, errors };
}

function resolveMount(
    mount: DashboardViewMount,
    path: string,
    depth: number,
    byId: ReadonlyMap<string, DashboardViewDefinition>,
    errors: string[],
): ResolvedDashboardView {
    if (depth > DASHBOARD_MAX_VIEW_DEPTH) {
        errors.push(`${path} exceeds the maximum view depth of ${DASHBOARD_MAX_VIEW_DEPTH}`);
    }
    const imported = mount.use ? byId.get(mount.use) : undefined;
    if (mount.use && !imported) {
        errors.push(`${path}.use references missing view "${mount.use}"`);
    }
    if (imported && mount.revision && imported.revision !== mount.revision) {
        errors.push(`${path}.revision does not match view "${mount.use}"`);
    }
    const importedChildren = imported
        ? (imported.view.children ?? []).map((child, index) =>
              resolveNode(child, imported, `${path}.imported.${index}`, depth + 1, errors),
          )
        : [];
    const mountedChildren = (mount.children ?? []).map((child, index) =>
        resolveMount(child, `${path}.children.${index}`, depth + 1, byId, errors),
    );
    return {
        id: mount.id,
        label: mount.label ?? imported?.view.label ?? mount.id,
        ...((mount.icon ?? imported?.view.icon) ? { icon: mount.icon ?? imported?.view.icon } : {}),
        ...(imported ? { source: imported.source, viewId: imported.id } : {}),
        ...(imported?.revision ? { viewRevision: imported.revision } : {}),
        widgets: structuredClone(imported?.view.widgets ?? []),
        children: [...importedChildren, ...mountedChildren],
    };
}

function resolveNode(
    node: DashboardViewNode,
    owner: DashboardViewDefinition,
    path: string,
    depth: number,
    errors: string[],
): ResolvedDashboardView {
    if (depth > DASHBOARD_MAX_VIEW_DEPTH) {
        errors.push(`${path} exceeds the maximum view depth of ${DASHBOARD_MAX_VIEW_DEPTH}`);
    }
    return {
        id: node.id,
        label: node.label,
        ...(node.icon ? { icon: node.icon } : {}),
        source: owner.source,
        viewId: owner.id,
        ...(owner.revision ? { viewRevision: owner.revision } : {}),
        widgets: structuredClone(node.widgets),
        children: (node.children ?? []).map((child, index) =>
            resolveNode(child, owner, `${path}.children.${index}`, depth + 1, errors),
        ),
    };
}
