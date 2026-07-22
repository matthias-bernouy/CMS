import { DuplicateDashboardError, type Dashboard, validateDashboard } from "@bernouy/cms-dashboards";
import { makeSourceUrn, parseUrn, type Source } from "@bernouy/cms-sources";
import type { IntegrationImportDeps, IntegrationImportOptions } from "../../../../../interfaces/IntegrationImport";
import { IntegrationInputError, IntegrationRuntimeError } from "../../../../errors";
import type { IntegrationDashboardWrite } from "../../../writes/dashboardWrites";

export async function buildDashboardWrites(
    deps: IntegrationImportDeps,
    dashboardArtifacts: Dashboard[],
    sourceArtifacts: Source[],
    dependencySourceIds: ReadonlySet<string>,
    options: IntegrationImportOptions,
): Promise<IntegrationDashboardWrite[]> {
    if (!dashboardArtifacts.length) {
        return [];
    }
    if (!deps.dashboards) {
        throw new IntegrationRuntimeError("dashboard repository not configured");
    }

    const sourceById = new Map(sourceArtifacts.map((source) => [sourceId(source), source]));
    const dependencySourceCache = new Map<string, Source | null>();
    const dashboardWrites: IntegrationDashboardWrite[] = [];
    const seen = new Set<string>();
    for (const dashboard of dashboardArtifacts) {
        if (seen.has(dashboard.id)) {
            throw new DuplicateDashboardError(dashboard.id);
        }
        seen.add(dashboard.id);
        let source = sourceById.get(dashboard.source);
        if (!source && dependencySourceIds.has(dashboard.source)) {
            if (!dependencySourceCache.has(dashboard.source)) {
                dependencySourceCache.set(
                    dashboard.source,
                    await deps.sources.getSource(makeSourceUrn(dashboard.source)),
                );
            }
            source = dependencySourceCache.get(dashboard.source) ?? undefined;
        }
        if (!source) {
            throw new IntegrationInputError(
                "artifacts",
                `dashboard "${dashboard.id}" references source "${dashboard.source}" not declared by this integration`,
            );
        }
        const errors = validateDashboard(dashboard, { source });
        if (errors.length) {
            throw new IntegrationInputError("artifacts", errors.join("; "));
        }
        const previous = await deps.dashboards.getDashboard(dashboard.id);
        if (!options.force && previous) {
            throw new DuplicateDashboardError(dashboard.id);
        }
        dashboardWrites.push({ dashboard, previous });
    }
    return dashboardWrites;
}

function sourceId(source: Source): string {
    return parseUrn(source.urn)?.source ?? source.urn;
}
