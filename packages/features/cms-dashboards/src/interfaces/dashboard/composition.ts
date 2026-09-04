import type { DashboardMeta } from "./refs";
import type { DashboardWidget } from "./widgets";

export const DASHBOARD_SCHEMA_VERSION = 2 as const;
export const DASHBOARD_MAX_VIEW_DEPTH = 3;

export type DashboardViewAvailability = {
    catalog?: boolean;
    defaultPlacement?: {
        dashboardId: string;
        order?: number;
    };
};

export type DashboardViewNode = {
    id: string;
    /** Suggested catalog presentation. A mounted dashboard owns the runtime label and icon. */
    label: string;
    icon?: string;
    widgets: DashboardWidget[];
    children?: DashboardViewNode[];
};

export type DashboardViewOrigin = {
    kind: "integration";
    integrationId: string;
    version: string;
};

export type DashboardViewDefinition = {
    schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
    id: string;
    source: string;
    meta: DashboardMeta;
    view: DashboardViewNode;
    availability?: DashboardViewAvailability;
    requires?: string;
    revision?: string;
    origin?: DashboardViewOrigin;
};

export type DashboardViewMount = {
    id: string;
    /** Authoritative runtime presentation when present; optional for V1 compatibility. */
    label?: string;
    icon?: string;
    use?: string;
    revision?: string;
    children?: DashboardViewMount[];
};

export type DashboardOrigin =
    | {
          kind: "integration";
          integrationId: string;
          version: string;
      }
    | {
          kind: "site";
          createdBy: string;
      };

export type DashboardDefinition = {
    schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
    id: string;
    meta: DashboardMeta;
    homeView: string;
    views: DashboardViewMount[];
    origin: DashboardOrigin;
    status: "draft" | "published";
    revision: string;
    executionPlan?: DashboardExecutionPlan;
};

export type ComposedDashboard = DashboardDefinition;

export type ResolvedDashboardView = {
    id: string;
    label: string;
    icon?: string;
    source?: string;
    widgets: DashboardWidget[];
    viewId?: string;
    viewRevision?: string;
    children: ResolvedDashboardView[];
};

export type ResolvedDashboard = Omit<DashboardDefinition, "views"> & {
    views: ResolvedDashboardView[];
};

export type DashboardAllowedCall = {
    sourceId: string;
    endpointId: string;
    method: string;
};

export type DashboardExecutionPlan = {
    dashboardId: string;
    revision: string;
    allowedCalls: DashboardAllowedCall[];
};
