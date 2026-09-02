import { dashboardRelationProjectionId } from "@bernouy/cms-relations";
import type { ControlCms } from "cms-control/ControlCms";

export type IntegrationArtifactContext = {
    sourceUrns: Set<string> | null;
    sourceOverlayIds: Set<string> | null;
    functionIds: Set<string> | null;
    dashboardIds: Set<string> | null;
    dashboardViewIds: Set<string> | null;
    relationIds: Set<string> | null;
    dashboardRelationProjectionIds: Set<string> | null;
    blocIds: Set<string> | null;
    triggerIds: Set<string> | null;
};

export async function loadIntegrationArtifactContext(cms: ControlCms): Promise<IntegrationArtifactContext> {
    const sourceUrns = await cms.sources
        .getAllSources()
        .then((sources) => new Set(sources.map((source) => source.urn)))
        .catch(() => null);
    const sourceOverlayIds = await (cms.sourceOverlays
        ? cms.sourceOverlays
              .getAllOverlays()
              .then((overlays) => new Set(overlays.map((overlay) => overlay.id)))
              .catch(() => null)
        : Promise.resolve(null));
    const dashboardIds = await cms.dashboards
        .getAllDashboards()
        .then((dashboards) => new Set(dashboards.map((dashboard) => dashboard.id)))
        .catch(() => null);
    const dashboardViewIds = await cms.dashboardViews
        .getAllViews()
        .then((views) => new Set(views.map((view) => view.id)))
        .catch(() => null);
    const relationIds = await cms.relations
        .getAllRelations()
        .then((relations) => new Set(relations.map((relation) => relation.id)))
        .catch(() => null);
    const dashboardRelationProjectionIds = await cms.relations
        .getAllDashboardRelationProjections()
        .then((projections) => new Set(projections.map(dashboardRelationProjectionId)))
        .catch(() => null);
    const functionIds = await (cms.functions
        ? cms.functions
              .getAllFunctions()
              .then((functions) => new Set(functions.map((fn) => fn.id)))
              .catch(() => null)
        : Promise.resolve(null));
    const blocIds = await cms.repository
        .getBlocsList()
        .then((blocs) => new Set(blocs.map((bloc) => bloc.id)))
        .catch(() => null);
    const triggerIds = await (cms.triggers
        ? cms.triggers
              .getAllTriggers()
              .then((triggers) => new Set(triggers.map((trigger) => trigger.id)))
              .catch(() => null)
        : Promise.resolve(null));
    return {
        sourceUrns,
        sourceOverlayIds,
        functionIds,
        dashboardIds,
        dashboardViewIds,
        relationIds,
        dashboardRelationProjectionIds,
        blocIds,
        triggerIds,
    };
}
