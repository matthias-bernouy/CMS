import type { DashboardDto, DashboardWidget } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "../types";

export type DetailSelection = {
    collection: string;
    row: string;
};

export type RenderContext = {
    group: DashboardSourceGroup;
    groups?: readonly DashboardSourceGroup[];
    dashboard: DashboardDto;
    selectedRows: ReadonlyMap<string, string>;
    drafts: ReadonlyMap<string, Record<string, unknown>>;
    filters?: ReadonlyMap<string, Readonly<Record<string, string>>>;
};

export type RuntimeDetailWidget = Extract<DashboardWidget, { widget: "w-detail" }>;

export type DashboardRuntimeWidget =
    | Exclude<DashboardWidget, Extract<DashboardWidget, { widget: "w-detail" }>>
    | RuntimeDetailWidget;
