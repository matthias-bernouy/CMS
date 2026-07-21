import type { DashboardDto, DashboardWidget } from "@bernouy/cms-dashboards";
import type { RelationDashboardAction, RelationDashboardColumn } from "@bernouy/cms-relations";
import type { DashboardSourceGroup } from "../types";

export type DetailSelection = {
    collection: string;
    row: string;
};

export type DetailResourceOverride = DetailSelection & {
    sourceId: string;
    dashboardId: string;
    resource: unknown;
};

export type RenderContext = {
    group: DashboardSourceGroup;
    dashboard: DashboardDto;
    selectedRows: ReadonlyMap<string, string>;
    drafts: ReadonlyMap<string, Record<string, unknown>>;
    detailResource?: DetailResourceOverride | null;
};

export type RelationTableWidget = {
    widget: "w-relation-table";
    id: string;
    title?: string;
    placement: "main" | "aside";
    relationId: string;
    fromId: string;
    pageSize?: number;
    rowKey: string;
    columns: RelationDashboardColumn[];
    actions?: RelationDashboardAction[];
};

export type RuntimeDetailWidget = Extract<DashboardWidget, { widget: "w-detail" }> & {
    relationWidgets?: RelationTableWidget[];
};

export type DashboardRuntimeWidget =
    | Exclude<DashboardWidget, Extract<DashboardWidget, { widget: "w-detail" }>>
    | RuntimeDetailWidget;
