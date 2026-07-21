import type { DashboardDto } from "@bernouy/cms-dashboards";
import type { DashboardRelationProjection } from "@bernouy/cms-relations";
import type { DetailSelection, RelationTableWidget } from "./types";

export function relationWidgetsFor(
    dashboard: DashboardDto,
    detail: DetailSelection,
    projections: readonly DashboardRelationProjection[],
): RelationTableWidget[] {
    return projections
        .filter(
            (projection) =>
                projection.dashboardId === dashboard.id &&
                projection.viewId === detail.collection &&
                projection.widget === "table",
        )
        .map((projection) => ({
            widget: "w-relation-table",
            id: projection.sectionId ?? `${projection.relationId}Relation`,
            ...(projection.title ? { title: projection.title } : {}),
            placement: projection.placement === "side" ? "aside" : "main",
            relationId: projection.relationId,
            fromId: detail.row,
            ...(projection.pageSize ? { pageSize: projection.pageSize } : {}),
            rowKey: projection.rowKey ?? "id",
            columns: projection.columns?.length
                ? projection.columns
                : [
                      {
                          id: "id",
                          label: "ID",
                          path: projection.rowKey ?? "id",
                          primary: true,
                      },
                  ],
            ...(projection.actions?.length ? { actions: projection.actions } : {}),
        }));
}
