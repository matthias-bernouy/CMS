import { DuplicateDashboardError, validateDashboard, type Dashboard } from "@bernouy/cms-dashboards";
import { DuplicateFunctionError, validateFunction, type CmsFunction } from "@bernouy/cms-functions";
import { DuplicateSourceError, makeSourceUrn, parseUrn, validateSource, type Source } from "@bernouy/cms-sources";
import { IntegrationInputError, IntegrationRuntimeError } from "../../errors";
import type { IntegrationDashboardWrite } from "../dashboardWrites";
import type { IntegrationFunctionWrite } from "../functionWrites";
import type { IntegrationSourceWrite } from "../sourceWrites";
import type {
    IntegrationBlocArtifact,
    IntegrationImportDeps,
    IntegrationImportOptions,
} from "../../../interfaces/IntegrationImport";

export async function buildSourceWrites(
    deps: IntegrationImportDeps,
    sourceArtifacts: Source[],
    options: IntegrationImportOptions,
): Promise<IntegrationSourceWrite[]> {
    const sourceWrites: IntegrationSourceWrite[] = [];
    const seen = new Set<string>();
    for (const source of sourceArtifacts) {
        if (seen.has(source.urn)) throw new DuplicateSourceError(source.urn);
        seen.add(source.urn);

        const errors = validateSource(source);
        if (errors.length) throw new IntegrationInputError("artifacts", errors.join("; "));
        const previous = await deps.sources.getSource(source.urn);
        if (!options.force && previous) throw new DuplicateSourceError(source.urn);
        sourceWrites.push({ source, previous });
    }
    return sourceWrites;
}

export async function buildFunctionWrites(
    deps: IntegrationImportDeps,
    functionArtifacts: CmsFunction[],
    options: IntegrationImportOptions,
): Promise<IntegrationFunctionWrite[]> {
    if (!functionArtifacts.length) return [];
    if (!deps.functions) throw new IntegrationRuntimeError("function repository not configured");

    const functionWrites: IntegrationFunctionWrite[] = [];
    const seen = new Set<string>();
    for (const fn of functionArtifacts) {
        if (seen.has(fn.id)) throw new DuplicateFunctionError(fn.id);
        seen.add(fn.id);

        const errors = await validateFunction(fn, { sources: deps.sources });
        if (errors.length) throw new IntegrationInputError("artifacts", errors.join("; "));
        const previous = await deps.functions.getFunction(fn.id);
        if (!options.force && previous) throw new DuplicateFunctionError(fn.id);
        functionWrites.push({ fn, previous });
    }
    return functionWrites;
}

export async function buildDashboardWrites(
    deps: IntegrationImportDeps,
    dashboardArtifacts: Dashboard[],
    sourceArtifacts: Source[],
    dependencySourceIds: ReadonlySet<string>,
    options: IntegrationImportOptions,
): Promise<IntegrationDashboardWrite[]> {
    if (!dashboardArtifacts.length) return [];
    if (!deps.dashboards) throw new IntegrationRuntimeError("dashboard repository not configured");

    const sourceById = new Map(sourceArtifacts.map(source => [sourceId(source), source]));
    const dependencySourceCache = new Map<string, Source | null>();
    const dashboardWrites: IntegrationDashboardWrite[] = [];
    const seen = new Set<string>();
    for (const dashboard of dashboardArtifacts) {
        if (seen.has(dashboard.id)) throw new DuplicateDashboardError(dashboard.id);
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
            throw new IntegrationInputError("artifacts", `dashboard "${dashboard.id}" references source "${dashboard.source}" not declared by this integration`);
        }
        const errors = validateDashboard(dashboard, { source });
        if (errors.length) throw new IntegrationInputError("artifacts", errors.join("; "));
        const previous = await deps.dashboards.getDashboard(dashboard.id);
        if (!options.force && previous) throw new DuplicateDashboardError(dashboard.id);
        dashboardWrites.push({ dashboard, previous });
    }
    return dashboardWrites;
}

export async function importBlocArtifacts(
    deps: IntegrationImportDeps,
    artifacts: IntegrationBlocArtifact[],
    options: IntegrationImportOptions,
) {
    if (!artifacts.length) return [];
    if (!deps.blocs) throw new IntegrationRuntimeError("bloc importer not configured");

    const seen = new Set<string>();
    const results = [];
    for (const artifact of artifacts) {
        if (seen.has(artifact.tag)) throw new IntegrationInputError("artifacts", `duplicate bloc artifact "${artifact.tag}"`);
        seen.add(artifact.tag);
        const result = await deps.blocs.importBloc(artifact, options);
        results.push({ type: "bloc" as const, id: result.id, action: result.action });
    }
    return results;
}

function sourceId(source: Source): string {
    return parseUrn(source.urn)?.source ?? source.urn;
}
