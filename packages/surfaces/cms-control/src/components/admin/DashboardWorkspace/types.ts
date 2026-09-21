import type { DashboardDefinition, ResolvedDashboard } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "../Resources/Dashboards/types";

export type DashboardSessionModel = {
    subject: { id: string; email?: string };
    logoutUrl: string;
    dashboards: DashboardDefinition[];
};

export type DashboardRuntimeModel = {
    dashboard: ResolvedDashboard;
    groups: DashboardSourceGroup[];
};
