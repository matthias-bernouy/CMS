import { applyDashboardSourceOverlays, type DashboardDto } from "@bernouy/cms-dashboards";
import { SYSTEM_FUNCTIONS_SOURCE_URN } from "@bernouy/cms-functions";
import type { DashboardRelationProjection, RelationRepository } from "@bernouy/cms-relations";
import {
    isSystemSourceUrn,
    materializeSourceOverlays,
    parseUrn,
    sourceOverlaySchemaCacheFor,
    sourceToDto,
    type ExecutorDeps,
    type Source,
    type SourceEndpointDto,
    type SourceOverlay,
    type SourceOverlayRepository,
    type SourceOverlaySchemaCache,
} from "@bernouy/cms-sources";
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
    sourceOverlays?: SourceOverlay[];
    dashboardRelationProjections?: DashboardRelationProjection[];
};

export type DashboardListResponse = DashboardSourceGroup[];

type DashboardCmsExtensions = {
    relations?: RelationRepository;
    sourceOverlays?: SourceOverlayRepository | null;
    sourceExecutorDeps?: ExecutorDeps;
};

export default async function listDashboards(_req: Request, cms: ControlCms): Promise<Response> {
    const extensions = cms as ControlCms & DashboardCmsExtensions;
    const relationRepository = extensions.relations;
    const [sources, dashboards, rawSourceOverlays, dashboardRelationProjections] = await Promise.all([
        cms.sources.getAllSources(),
        cms.dashboards.getAllDashboards(),
        extensions.sourceOverlays?.getAllOverlays() ?? Promise.resolve([]),
        relationRepository?.getAllDashboardRelationProjections() ?? Promise.resolve([]),
    ]);
    const sourceOverlays = await materializeOverlays(
        sources,
        rawSourceOverlays,
        extensions.sourceExecutorDeps,
        extensions.sourceOverlays ? sourceOverlaySchemaCacheFor(extensions.sourceOverlays) : undefined,
    );
    const dashboardsBySource = new Map<string, DashboardDto[]>();
    for (const dashboard of dashboards) {
        const list = dashboardsBySource.get(dashboard.source) ?? [];
        list.push(dashboard);
        dashboardsBySource.set(dashboard.source, list);
    }

    const groups: DashboardSourceGroup[] = sources
        .filter((source) => source.urn !== SYSTEM_FUNCTIONS_SOURCE_URN)
        .map((source) => {
            const dto = sourceToDto(source);
            const id = parseUrn(source.urn)?.source ?? dto.id;
            const overlays = sourceOverlays.filter((overlay) => overlay.sourceId === id);
            const sourceDashboards = (dashboardsBySource.get(id) ?? []).map((dashboard) =>
                applyDashboardSourceOverlays(dashboard, overlays),
            );
            const sourceDashboardIds = new Set(sourceDashboards.map((dashboard) => dashboard.id));
            const sourceDashboardRelationProjections = dashboardRelationProjections.filter((projection) =>
                sourceDashboardIds.has(projection.dashboardId),
            );
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
                ...(overlays.length ? { sourceOverlays: overlays } : {}),
                ...(sourceDashboardRelationProjections.length
                    ? { dashboardRelationProjections: sourceDashboardRelationProjections }
                    : {}),
            };
        });

    return new Response(JSON.stringify(groups), {
        headers: { "Content-Type": "application/json" },
    });
}

async function materializeOverlays(
    sources: readonly Source[],
    overlays: readonly SourceOverlay[],
    deps: ExecutorDeps | undefined,
    cache: SourceOverlaySchemaCache | undefined,
): Promise<SourceOverlay[]> {
    const sourcesById = new Map(sources.map((source) => [parseUrn(source.urn)?.source ?? "", source]));
    const resolved: SourceOverlay[] = [];
    for (const source of sourcesById.values()) {
        const matching = overlays.filter((overlay) => overlay.sourceId === parseUrn(source.urn)?.source);
        resolved.push(...(await materializeSourceOverlays(source, matching, deps, cache)));
    }
    return resolved;
}
