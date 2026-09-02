import {
    compileDashboardExecutionPlan,
    DuplicateDashboardError,
    resolveDashboardViews,
    validateDashboardStructure,
    type DashboardDefinition,
    type DashboardViewMount,
    type DashboardViewDefinition,
} from "@bernouy/cms-dashboards";
import type { SourceRepository } from "@bernouy/cms-sources";
import type { IntegrationImportDeps, IntegrationImportOptions } from "../../../../../interfaces/IntegrationImport";
import { IntegrationInputError, IntegrationRuntimeError } from "../../../../errors";
import type { IntegrationDashboardWrite } from "../../../writes/dashboardWrites";

export async function buildDashboardWrites(
    deps: IntegrationImportDeps,
    dashboardArtifacts: DashboardDefinition[],
    currentViews: DashboardViewDefinition[],
    options: IntegrationImportOptions,
): Promise<IntegrationDashboardWrite[]> {
    if (!dashboardArtifacts.length) {
        return [];
    }
    if (!deps.dashboards || !deps.dashboardViews) {
        throw new IntegrationRuntimeError("dashboard repositories not configured");
    }
    const availableViews = mergeViews(await deps.dashboardViews.getAllViews(), currentViews);
    const writes: IntegrationDashboardWrite[] = [];
    const seen = new Set<string>();
    for (const dashboard of dashboardArtifacts) {
        if (seen.has(dashboard.id)) {
            throw new DuplicateDashboardError(dashboard.id);
        }
        seen.add(dashboard.id);
        const errors = validateDashboardStructure(dashboard);
        errors.push(...resolveDashboardViews(dashboard, availableViews).errors);
        if (errors.length) {
            throw new IntegrationInputError("artifacts", errors.join("; "));
        }
        const previous = await deps.dashboards.getDashboard(dashboard.id);
        if (!options.force && previous) {
            throw new DuplicateDashboardError(dashboard.id);
        }
        writes.push({ dashboard, previous });
    }
    return writes;
}

export async function buildSiteDashboardRefreshWrites(
    deps: IntegrationImportDeps,
    integrationId: string,
    targetViews: DashboardViewDefinition[],
    sources: SourceRepository,
): Promise<IntegrationDashboardWrite[]> {
    if (!deps.dashboards || !deps.dashboardViews) {
        return [];
    }
    const installedViews = await deps.dashboardViews.getAllViews();
    const ownedIds = new Set(
        installedViews.filter((view) => view.origin?.integrationId === integrationId).map((view) => view.id),
    );
    const installation = await deps.installations?.get(integrationId);
    for (const artifact of installation?.artifacts ?? []) {
        if (artifact.type === "dashboard-view") {
            ownedIds.add(artifact.id);
        }
    }
    if (!ownedIds.size) {
        return [];
    }

    const nextById = new Map(targetViews.map((view) => [view.id, view]));
    const availableById = new Map(installedViews.map((view) => [view.id, view]));
    ownedIds.forEach((id) => availableById.delete(id));
    targetViews.forEach((view) => availableById.set(view.id, view));
    const writes: IntegrationDashboardWrite[] = [];

    for (const previous of await deps.dashboards.getAllDashboards()) {
        if (previous.origin.kind !== "site") {
            continue;
        }
        const references = affectedReferences(previous.views, ownedIds);
        if (!references.length) {
            continue;
        }
        const removed = references.filter(({ viewId }) => !nextById.has(viewId));
        if (removed.length) {
            const paths = removed.map(({ path, viewId }) => `"${viewId}" at "${path}"`).join(", ");
            throw new IntegrationRuntimeError(
                `cannot update integration "${integrationId}": site dashboard "${previous.meta.name}" uses removed dashboard view ${paths}`,
                409,
            );
        }

        const candidate: DashboardDefinition = {
            ...structuredClone(previous),
            views: refreshPins(previous.views, nextById),
            revision: nextRevision(previous.revision),
            executionPlan: undefined,
        };
        const errors = validateDashboardStructure(candidate);
        const resolved = resolveDashboardViews(candidate, [...availableById.values()]);
        errors.push(...resolved.errors);
        const compiled =
            resolved.dashboard && candidate.status === "published"
                ? await compileDashboardExecutionPlan(resolved.dashboard, sources)
                : null;
        errors.push(...(compiled?.errors ?? []));
        if (errors.length || (candidate.status === "published" && !compiled?.plan)) {
            throw new IntegrationRuntimeError(
                `cannot update integration "${integrationId}": site dashboard "${previous.meta.name}" cannot be recompiled: ${errors.join("; ")}`,
                409,
            );
        }
        writes.push({
            previous,
            dashboard: {
                ...candidate,
                ...(compiled?.plan ? { executionPlan: compiled.plan } : {}),
            },
        });
    }
    return writes;
}

function mergeViews(
    installed: DashboardViewDefinition[],
    current: DashboardViewDefinition[],
): DashboardViewDefinition[] {
    const views = new Map(installed.map((view) => [view.id, view]));
    current.forEach((view) => views.set(view.id, view));
    return [...views.values()];
}

function affectedReferences(
    mounts: DashboardViewMount[],
    ownedIds: ReadonlySet<string>,
    parentPath = "",
): Array<{ viewId: string; path: string }> {
    return mounts.flatMap((mount) => {
        const path = parentPath ? `${parentPath} > ${mount.label ?? mount.id}` : (mount.label ?? mount.id);
        return [
            ...(mount.use && ownedIds.has(mount.use) ? [{ viewId: mount.use, path }] : []),
            ...affectedReferences(mount.children ?? [], ownedIds, path),
        ];
    });
}

function refreshPins(
    mounts: DashboardViewMount[],
    views: ReadonlyMap<string, DashboardViewDefinition>,
): DashboardViewMount[] {
    return mounts.map((mount) => {
        const view = mount.use ? views.get(mount.use) : undefined;
        return {
            ...structuredClone(mount),
            ...(view?.revision ? { revision: view.revision } : {}),
            ...(mount.children ? { children: refreshPins(mount.children, views) } : {}),
        };
    });
}

function nextRevision(revision: string): string {
    const numeric = Number.parseInt(revision, 10);
    return Number.isSafeInteger(numeric) && numeric >= 0 ? String(numeric + 1) : crypto.randomUUID();
}
