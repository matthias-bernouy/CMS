import { IntegrationRuntimeError } from "../../errors";
import { writeDashboardsWithRollback, type IntegrationDashboardWrite } from "../dashboardWrites";
import { writeFunctionsWithRollback, type IntegrationFunctionWrite } from "../functionWrites";
import {
    writeDashboardRelationProjectionsWithRollback,
    writeRelationsWithRollback,
    type IntegrationDashboardRelationProjectionWrite,
    type IntegrationRelationWrite,
} from "../relationWrites";
import { writeSourceOverlaysWithRollback, type IntegrationSourceOverlayWrite } from "../sourceOverlayWrites";
import { writeTriggersWithRollback, type IntegrationTriggerWrite } from "../triggerWrites";
import type {
    IntegrationArtifactResult,
    IntegrationImportDeps,
} from "../../../interfaces/IntegrationImport";

export type DeclarativeArtifactWriteResults = {
    sourceResults: IntegrationArtifactResult[];
    functionResults: IntegrationArtifactResult[];
    triggerResults: IntegrationArtifactResult[];
    dashboardResults: IntegrationArtifactResult[];
    sourceOverlayResults: IntegrationArtifactResult[];
    relationResults: IntegrationArtifactResult[];
    dashboardRelationProjectionResults: IntegrationArtifactResult[];
};

export type DeclarativeArtifactWriteStack<T> = {
    deps: IntegrationImportDeps;
    sourceResults: IntegrationArtifactResult[];
    functionWrites: IntegrationFunctionWrite[];
    triggerWrites: IntegrationTriggerWrite[];
    dashboardWrites: IntegrationDashboardWrite[];
    sourceOverlayWrites: IntegrationSourceOverlayWrite[];
    relationWrites: IntegrationRelationWrite[];
    dashboardRelationProjectionWrites: IntegrationDashboardRelationProjectionWrite[];
    finish(results: DeclarativeArtifactWriteResults): Promise<T>;
};

export function writeDeclarativeArtifactStack<T>(stack: DeclarativeArtifactWriteStack<T>): Promise<T> {
    const done = (
        functionResults: IntegrationArtifactResult[],
        triggerResults: IntegrationArtifactResult[],
        dashboardResults: IntegrationArtifactResult[],
        sourceOverlayResults: IntegrationArtifactResult[],
        relationResults: IntegrationArtifactResult[],
        dashboardRelationProjectionResults: IntegrationArtifactResult[],
    ) => stack.finish({
        sourceResults: stack.sourceResults,
        functionResults,
        triggerResults,
        dashboardResults,
        sourceOverlayResults,
        relationResults,
        dashboardRelationProjectionResults,
    });

    const writeProjections = (
        functionResults: IntegrationArtifactResult[],
        triggerResults: IntegrationArtifactResult[],
        dashboardResults: IntegrationArtifactResult[],
        sourceOverlayResults: IntegrationArtifactResult[],
        relationResults: IntegrationArtifactResult[],
    ) => {
        if (!stack.dashboardRelationProjectionWrites.length) {
            return done(functionResults, triggerResults, dashboardResults, sourceOverlayResults, relationResults, []);
        }
        return writeDashboardRelationProjectionsWithRollback(
            stack.deps.relations ?? missingRelationRepository(),
            stack.dashboardRelationProjectionWrites,
            projectionResults => done(functionResults, triggerResults, dashboardResults, sourceOverlayResults, relationResults, projectionResults),
        );
    };

    const writeRelations = (
        functionResults: IntegrationArtifactResult[],
        triggerResults: IntegrationArtifactResult[],
        dashboardResults: IntegrationArtifactResult[],
        sourceOverlayResults: IntegrationArtifactResult[],
    ) => {
        if (!stack.relationWrites.length) return writeProjections(functionResults, triggerResults, dashboardResults, sourceOverlayResults, []);
        return writeRelationsWithRollback(stack.deps.relations ?? missingRelationRepository(), stack.relationWrites, relationResults =>
            writeProjections(functionResults, triggerResults, dashboardResults, sourceOverlayResults, relationResults));
    };

    const writeOverlays = (
        functionResults: IntegrationArtifactResult[],
        triggerResults: IntegrationArtifactResult[],
        dashboardResults: IntegrationArtifactResult[],
    ) => {
        if (!stack.sourceOverlayWrites.length) return writeRelations(functionResults, triggerResults, dashboardResults, []);
        return writeSourceOverlaysWithRollback(
            stack.deps.sourceOverlays ?? missingSourceOverlayRepository(),
            stack.sourceOverlayWrites,
            overlayResults => writeRelations(functionResults, triggerResults, dashboardResults, overlayResults),
        );
    };

    const writeDashboards = (
        functionResults: IntegrationArtifactResult[],
        triggerResults: IntegrationArtifactResult[],
    ) => {
        if (!stack.dashboardWrites.length) return writeOverlays(functionResults, triggerResults, []);
        return writeDashboardsWithRollback(stack.deps.dashboards ?? missingDashboardRepository(), stack.dashboardWrites, dashboardResults =>
            writeOverlays(functionResults, triggerResults, dashboardResults));
    };

    const writeTriggers = (functionResults: IntegrationArtifactResult[]) => {
        if (!stack.triggerWrites.length) return writeDashboards(functionResults, []);
        return writeTriggersWithRollback(stack.deps.triggers ?? missingTriggerRepository(), stack.triggerWrites, triggerResults =>
            writeDashboards(functionResults, triggerResults));
    };

    if (!stack.functionWrites.length) return writeTriggers([]);
    return writeFunctionsWithRollback(stack.deps.functions ?? missingFunctionRepository(), stack.functionWrites, writeTriggers);
}

function missingDashboardRepository(): never {
    throw new IntegrationRuntimeError("dashboard repository not configured");
}

function missingFunctionRepository(): never {
    throw new IntegrationRuntimeError("function repository not configured");
}

function missingTriggerRepository(): never {
    throw new IntegrationRuntimeError("trigger repository not configured");
}

function missingSourceOverlayRepository(): never {
    throw new IntegrationRuntimeError("source overlay repository not configured");
}

function missingRelationRepository(): never {
    throw new IntegrationRuntimeError("relation repository not configured");
}
