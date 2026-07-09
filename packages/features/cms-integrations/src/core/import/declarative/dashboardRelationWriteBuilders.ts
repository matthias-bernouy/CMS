import {
    dashboardRelationProjectionId,
    DuplicateDashboardRelationProjectionError,
    validateDashboardRelationProjection,
    type CmsRelation,
    type DashboardRelationProjection,
} from "@bernouy/cms-relations";
import type {
    Dashboard,
    DashboardWidget,
} from "@bernouy/cms-dashboards";
import { IntegrationInputError, IntegrationRuntimeError } from "../../errors";
import type { IntegrationDashboardRelationProjectionWrite } from "../relationWrites";
import type {
    IntegrationImportDeps,
    IntegrationImportOptions,
} from "../../../interfaces/IntegrationImport";

export async function buildDashboardRelationProjectionWrites(
    deps: IntegrationImportDeps,
    projections: DashboardRelationProjection[],
    relationArtifacts: CmsRelation[],
    dashboardArtifacts: Dashboard[],
    options: IntegrationImportOptions,
): Promise<IntegrationDashboardRelationProjectionWrite[]> {
    if (!projections.length) return [];
    if (!deps.relations) throw new IntegrationRuntimeError("relation repository not configured");
    if (!deps.dashboards) throw new IntegrationRuntimeError("dashboard repository not configured");

    const relationById = new Map(relationArtifacts.map(relation => [relation.id, relation]));
    const dashboardById = new Map(dashboardArtifacts.map(dashboard => [dashboard.id, dashboard]));
    const writes: IntegrationDashboardRelationProjectionWrite[] = [];
    const seen = new Set<string>();

    for (const projection of projections) {
        const id = dashboardRelationProjectionId(projection);
        if (seen.has(id)) throw new DuplicateDashboardRelationProjectionError(id);
        seen.add(id);

        const errors = validateDashboardRelationProjection(projection);
        if (errors.length) throw new IntegrationInputError("artifacts", errors.join("; "));
        await validateProjectionTarget(deps, projection, id, relationById, dashboardById);

        const previous = await deps.relations.getDashboardRelationProjection(id);
        if (!options.force && previous) throw new DuplicateDashboardRelationProjectionError(id);
        writes.push({ projection, previous });
    }
    return writes;
}

async function validateProjectionTarget(
    deps: IntegrationImportDeps,
    projection: DashboardRelationProjection,
    id: string,
    relationById: Map<string, CmsRelation>,
    dashboardById: Map<string, Dashboard>,
): Promise<void> {
    const relation = relationById.get(projection.relationId) ?? await deps.relations!.getRelation(projection.relationId);
    if (!relation) throw new IntegrationInputError("artifacts", `dashboard relation projection "${id}" references unknown relation "${projection.relationId}"`);

    const dashboard = dashboardById.get(projection.dashboardId) ?? await deps.dashboards!.getDashboard(projection.dashboardId);
    if (!dashboard) throw new IntegrationInputError("artifacts", `dashboard relation projection "${id}" references unknown dashboard "${projection.dashboardId}"`);
    if (relation.from.sourceId !== dashboard.source) {
        throw new IntegrationInputError(
            "artifacts",
            `dashboard relation projection "${id}" targets dashboard source "${dashboard.source}" but relation starts from "${relation.from.sourceId}"`,
        );
    }
    const view = findDashboardWidget(dashboard.views, projection.viewId);
    if (!view) throw new IntegrationInputError("artifacts", `dashboard relation projection "${id}" references unknown dashboard view "${projection.viewId}"`);
    if (view.widget !== "w-detail") throw new IntegrationInputError("artifacts", `dashboard relation projection "${id}" must target a w-detail view`);
}

function findDashboardWidget(widgets: DashboardWidget[], id: string): DashboardWidget | null {
    for (const widget of widgets) {
        if (widget.id === id) return widget;
        const children = widget.widget === "w-section"
            ? widget.children
            : widget.widget === "w-tabs"
                ? widget.tabs.flatMap(tab => tab.children)
                : [];
        const found = findDashboardWidget(children, id);
        if (found) return found;
    }
    return null;
}
