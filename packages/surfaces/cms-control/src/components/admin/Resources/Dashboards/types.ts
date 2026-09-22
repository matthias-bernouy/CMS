import type { DashboardDto } from "@bernouy/cms-dashboards";
import type { SourceEndpointDto, SourceOverlay } from "@bernouy/cms-sources";

export type DashboardSourceSummary = {
    urn: string;
    id: string;
    name: string;
    icon?: string;
    svg?: string;
    endpointCount: number;
    dashboardCount: number;
    readonly: boolean;
};

export type DashboardSourceGroup = {
    source: DashboardSourceSummary;
    endpoints: SourceEndpointDto[];
    dashboards: DashboardDto[];
    sourceOverlays?: SourceOverlay[];
};

export type DashboardListResponse = DashboardSourceGroup[];
