import type { DashboardDto } from "@bernouy/cms-dashboards";
import { isSystemSourceUrn, parseUrn, sourceToDto, type SourceEndpointDto } from "@bernouy/cms-sources";
import type { ControlCms } from "cms-control/ControlCms";

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
};

export type DashboardListResponse = DashboardSourceGroup[];

export default async function listDashboards(_req: Request, cms: ControlCms): Promise<Response> {
    const [sources, dashboards] = await Promise.all([
        cms.sources.getAllSources(),
        cms.dashboards.getAllDashboards(),
    ]);
    const dashboardsBySource = new Map<string, DashboardDto[]>();
    for (const dashboard of dashboards) {
        const list = dashboardsBySource.get(dashboard.source) ?? [];
        list.push(dashboard);
        dashboardsBySource.set(dashboard.source, list);
    }

    const groups: DashboardSourceGroup[] = sources.map(source => {
        const dto = sourceToDto(source);
        const id = parseUrn(source.urn)?.source ?? dto.id;
        const sourceDashboards = dashboardsBySource.get(id) ?? [];
        return {
            source: {
                urn: source.urn,
                id,
                name: source.meta?.name ?? id,
                ...(source.meta?.icon ? { icon: source.meta.icon } : {}),
                ...(source.meta?.svg ? { svg: source.meta.svg } : {}),
                endpointCount: source.endpoints.length,
                dashboardCount: sourceDashboards.length,
                readonly: isSystemSourceUrn(source.urn),
            },
            endpoints: dto.endpoints,
            dashboards: sourceDashboards,
        };
    });

    return new Response(JSON.stringify(groups), {
        headers: { "Content-Type": "application/json" },
    });
}
