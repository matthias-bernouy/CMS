import type { DashboardDto } from "@bernouy/cms-dashboards";
import type { SourceEndpointDto } from "@bernouy/cms-sources";

export type DashboardSourceSummary = {
    urn: string;
    id: string;
    name: string;
    endpointCount: number;
    dashboardCount: number;
    readonly: boolean;
};

export type DashboardSourceGroup = {
    source: DashboardSourceSummary;
    endpoints: SourceEndpointDto[];
    dashboards: DashboardDto[];
};

export type DashboardListResponse = DashboardSourceGroup[];
