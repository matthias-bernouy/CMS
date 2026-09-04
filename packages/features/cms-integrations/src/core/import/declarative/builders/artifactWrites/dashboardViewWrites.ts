import {
    DuplicateDashboardViewError,
    dashboardViewAsLegacyDashboard,
    validateDashboard,
    validateDashboardViewStructure,
    type DashboardViewDefinition,
} from "@bernouy/cms-dashboards";
import { makeSourceUrn, parseUrn, type Source } from "@bernouy/cms-sources";
import type { IntegrationImportDeps, IntegrationImportOptions } from "../../../../../interfaces/IntegrationImport";
import { IntegrationInputError, IntegrationRuntimeError } from "../../../../errors";
import type { IntegrationDashboardViewWrite } from "../../../writes/dashboardViewWrites";

export async function buildDashboardViewWrites(
    deps: IntegrationImportDeps,
    views: DashboardViewDefinition[],
    sourceArtifacts: Source[],
    dependencySourceIds: ReadonlySet<string>,
    options: IntegrationImportOptions,
): Promise<IntegrationDashboardViewWrite[]> {
    if (!views.length) {
        return [];
    }
    if (!deps.dashboardViews) {
        throw new IntegrationRuntimeError("dashboard view repository not configured");
    }
    const sourceById = new Map(sourceArtifacts.map((source) => [sourceId(source), source]));
    const dependencySourceCache = new Map<string, Source | null>();
    const writes: IntegrationDashboardViewWrite[] = [];
    const seen = new Set<string>();
    for (const view of views) {
        if (seen.has(view.id)) {
            throw new DuplicateDashboardViewError(view.id);
        }
        seen.add(view.id);
        let source = sourceById.get(view.source);
        if (!source && dependencySourceIds.has(view.source)) {
            if (!dependencySourceCache.has(view.source)) {
                dependencySourceCache.set(view.source, await deps.sources.getSource(makeSourceUrn(view.source)));
            }
            source = dependencySourceCache.get(view.source) ?? undefined;
        }
        if (!source) {
            throw new IntegrationInputError(
                "artifacts",
                `dashboard view "${view.id}" references source "${view.source}" not declared by this integration`,
            );
        }
        const errors = validateDashboardViewStructure(view);
        errors.push(...validateDashboard(dashboardViewAsLegacyDashboard(view), { source }));
        if (errors.length) {
            throw new IntegrationInputError("artifacts", errors.join("; "));
        }
        const previous = await deps.dashboardViews.getView(view.id);
        if (!options.force && previous) {
            throw new DuplicateDashboardViewError(view.id);
        }
        writes.push({ view, previous });
    }
    return writes;
}

function sourceId(source: Source): string {
    return parseUrn(source.urn)?.source ?? source.urn;
}
