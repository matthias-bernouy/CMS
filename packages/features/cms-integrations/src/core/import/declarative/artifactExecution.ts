import { type TemplateContext } from "../../definitions/templating/templates";
import { IntegrationRuntimeError } from "../../errors";
import type { IntegrationDefinition } from "../../../interfaces/Integration";
import type {
    IntegrationArtifactResult,
    IntegrationImportDeps,
    IntegrationImportOptions,
    IntegrationImportResult,
} from "../../../interfaces/IntegrationImport";
import { writeSourcesWithRollback } from "../writes/sourceWrites";
import { applyIntegrationAccessGrants, buildIntegrationAccessGrants } from "./accessGrants";
import { writeDeclarativeArtifactStack, type DeclarativeArtifactWriteResults } from "./artifactWriteStack";
import {
    buildBlocArtifacts,
    buildDashboardArtifacts,
    buildDashboardViewArtifacts,
    buildDashboardRelationProjectionArtifacts,
    buildFunctionArtifacts,
    buildRelationArtifacts,
    buildSourceArtifacts,
    buildSourceOverlayArtifacts,
    buildTriggerArtifacts,
} from "./builders/artifactBuilders";
import { importBlocArtifacts } from "./builders/artifactWrites/blocImports";
import { buildDashboardWrites, buildSiteDashboardRefreshWrites } from "./builders/artifactWrites/dashboardWrites";
import { buildDashboardViewWrites } from "./builders/artifactWrites/dashboardViewWrites";
import { buildFunctionWrites } from "./builders/artifactWrites/functionWrites";
import { buildSourceWrites } from "./builders/artifactWrites/sourceWrites";
import { buildDashboardRelationProjectionWrites } from "./builders/dashboardRelationWriteBuilders";
import { buildRelationWrites } from "./builders/relationWriteBuilders";
import { buildSourceOverlayWrites } from "./builders/sourceOverlayWriteBuilders";
import { buildTriggerWrites } from "./builders/triggerWriteBuilders";
import { projectTargetSources } from "./projectedSourceRepository";

type DeclarativeArtifactExecution<T> = {
    deps: IntegrationImportDeps;
    definition: IntegrationDefinition;
    context: TemplateContext;
    options: IntegrationImportOptions;
    baseResult: Omit<IntegrationImportResult, "artifacts">;
    commit?: (result: IntegrationImportResult) => Promise<T>;
    confirmedSourceResults?: IntegrationArtifactResult[];
    hiddenSourceIds?: ReadonlySet<string>;
};

type PreparedDeclarativeArtifactWrites = {
    sourceWrites: Awaited<ReturnType<typeof buildSourceWrites>>;
    functionWrites: Awaited<ReturnType<typeof buildFunctionWrites>>;
    triggerWrites: Awaited<ReturnType<typeof buildTriggerWrites>>;
    dashboardViewWrites: Awaited<ReturnType<typeof buildDashboardViewWrites>>;
    siteDashboardRefreshWrites: Awaited<ReturnType<typeof buildSiteDashboardRefreshWrites>>;
    dashboardWrites: Awaited<ReturnType<typeof buildDashboardWrites>>;
    sourceOverlayWrites: Awaited<ReturnType<typeof buildSourceOverlayWrites>>;
    relationWrites: Awaited<ReturnType<typeof buildRelationWrites>>;
    projectionWrites: Awaited<ReturnType<typeof buildDashboardRelationProjectionWrites>>;
    blocArtifacts: ReturnType<typeof buildBlocArtifacts>;
    accessGrants: ReturnType<typeof buildIntegrationAccessGrants>;
    confirmedSourceResults: IntegrationArtifactResult[];
};

export async function executeDeclarativeArtifactWrites<T>(input: DeclarativeArtifactExecution<T>): Promise<{
    importResult: IntegrationImportResult;
    committed?: T;
}> {
    const prepared = await prepareDeclarativeArtifactWrites(input);
    const writeRemainingArtifacts = async (sourceResults: IntegrationArtifactResult[]) =>
        await writeDeclarativeArtifactStack({
            deps: input.deps,
            sourceResults,
            functionWrites: prepared.functionWrites,
            triggerWrites: prepared.triggerWrites,
            dashboardViewWrites: prepared.dashboardViewWrites,
            siteDashboardRefreshWrites: prepared.siteDashboardRefreshWrites,
            dashboardWrites: prepared.dashboardWrites,
            sourceOverlayWrites: prepared.sourceOverlayWrites,
            relationWrites: prepared.relationWrites,
            dashboardRelationProjectionWrites: prepared.projectionWrites,
            finish: async (results) =>
                await finishArtifactWrites(input, results, prepared.blocArtifacts, prepared.accessGrants),
        });
    return await writeSourcesWithRollback(
        input.deps.sources,
        prepared.sourceWrites,
        async (sourceResults) => await writeRemainingArtifacts([...prepared.confirmedSourceResults, ...sourceResults]),
    );
}

export async function prepareDeclarativeArtifactWrites(
    input: DeclarativeArtifactExecution<unknown>,
): Promise<PreparedDeclarativeArtifactWrites> {
    const sourceArtifacts = buildSourceArtifacts(input.definition, input.context);
    const functionArtifacts = buildFunctionArtifacts(input.definition, input.context);
    const accessGrants = buildIntegrationAccessGrants(sourceArtifacts, functionArtifacts);
    const triggerArtifacts = buildTriggerArtifacts(input.definition, input.context);
    const dashboardViewArtifacts = buildDashboardViewArtifacts(input.definition, input.context);
    const dashboardArtifacts = buildDashboardArtifacts(input.definition, input.context, dashboardViewArtifacts);
    const dependencySourceIds = new Set(
        Object.values(input.context.dependencies ?? {})
            .map((dependency) => dependency.sourceId)
            .filter((sourceId): sourceId is string => typeof sourceId === "string"),
    );
    const sourceOverlayArtifacts = buildSourceOverlayArtifacts(input.definition, input.context);
    const relationArtifacts = buildRelationArtifacts(input.definition, input.context);
    const projectionArtifacts = buildDashboardRelationProjectionArtifacts(input.definition, input.context);
    const blocArtifacts = buildBlocArtifacts(
        input.definition,
        input.context,
        input.options.activeResources ? new Set(input.options.activeResources) : undefined,
    );

    const dashboardViewWrites = await buildDashboardViewWrites(
        input.deps,
        dashboardViewArtifacts,
        sourceArtifacts,
        dependencySourceIds,
        input.options,
    );
    const dashboardWrites = await buildDashboardWrites(
        input.deps,
        dashboardArtifacts,
        dashboardViewArtifacts,
        input.options,
    );
    const sourceOverlayWrites = await buildSourceOverlayWrites(input.deps, sourceOverlayArtifacts);
    const relationWrites = await buildRelationWrites(input.deps, relationArtifacts, sourceArtifacts, input.options);
    const projectionWrites = await buildDashboardRelationProjectionWrites(
        input.deps,
        projectionArtifacts,
        relationArtifacts,
        dashboardViewArtifacts.map((view) => ({
            id: view.id,
            source: view.source,
            meta: view.meta,
            views: view.view.widgets,
            ...(view.requires ? { requires: view.requires } : {}),
        })),
        input.options,
    );

    const confirmedSourceResults = input.confirmedSourceResults ?? [];
    const confirmedSourceIds = new Set(confirmedSourceResults.map((artifact) => artifact.id));
    if (
        confirmedSourceIds.size !== confirmedSourceResults.length ||
        [...confirmedSourceIds].some((id) => !sourceArtifacts.some((source) => source.urn === id))
    ) {
        throw new IntegrationRuntimeError("confirmed migration Sources do not match the target definition");
    }
    const sourceWrites = await buildSourceWrites(
        input.deps,
        sourceArtifacts.filter((source) => !confirmedSourceIds.has(source.urn)),
        input.options,
    );
    const projectedDeps = {
        ...input.deps,
        sources: projectTargetSources(input.deps.sources, sourceArtifacts, input.hiddenSourceIds),
    };
    return {
        sourceWrites,
        functionWrites: await buildFunctionWrites(projectedDeps, functionArtifacts, input.options),
        triggerWrites: await buildTriggerWrites(input.deps, triggerArtifacts, input.options),
        dashboardViewWrites,
        siteDashboardRefreshWrites: await buildSiteDashboardRefreshWrites(
            input.deps,
            input.definition.kind,
            dashboardViewArtifacts,
            projectedDeps.sources,
        ),
        dashboardWrites,
        sourceOverlayWrites,
        relationWrites,
        projectionWrites,
        blocArtifacts,
        accessGrants,
        confirmedSourceResults,
    };
}

async function finishArtifactWrites<T>(
    input: DeclarativeArtifactExecution<T>,
    results: DeclarativeArtifactWriteResults,
    blocArtifacts: ReturnType<typeof buildBlocArtifacts>,
    accessGrants: ReturnType<typeof buildIntegrationAccessGrants>,
): Promise<{ importResult: IntegrationImportResult; committed?: T }> {
    const blocImportResults = await importBlocArtifacts(input.deps, blocArtifacts, input.options, {
        integrationKind: input.definition.kind,
        installationId: input.definition.kind,
        definitionVersion: input.definition.version ?? "unversioned",
    });
    await applyIntegrationAccessGrants(input.deps.roles, accessGrants);
    const importResult = {
        artifacts: [
            ...results.sourceResults,
            ...results.functionResults,
            ...results.triggerResults,
            ...results.dashboardViewResults,
            ...results.dashboardResults,
            ...results.sourceOverlayResults,
            ...results.relationResults,
            ...results.dashboardRelationProjectionResults,
            ...blocImportResults,
        ],
        ...input.baseResult,
    };
    return input.commit ? { importResult, committed: await input.commit(importResult) } : { importResult };
}
