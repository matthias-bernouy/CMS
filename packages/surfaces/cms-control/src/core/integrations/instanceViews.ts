import type { ControlCms } from "cms-control/ControlCms";
import type { IntegrationArtifactResult, IntegrationInstance } from "@bernouy/cms-integrations";

export type IntegrationArtifactContext = {
    sourceUrns: Set<string> | null;
    dashboardIds: Set<string> | null;
};

export async function loadIntegrationArtifactContext(cms: ControlCms): Promise<IntegrationArtifactContext> {
    const sourceUrns = await cms.sources.getAllSources()
        .then(sources => new Set(sources.map(source => source.urn)))
        .catch(() => null);
    const dashboardIds = await cms.dashboards.getAllDashboards()
        .then(dashboards => new Set(dashboards.map(dashboard => dashboard.id)))
        .catch(() => null);
    return { sourceUrns, dashboardIds };
}

export function buildIntegrationInstanceView(
    context: IntegrationArtifactContext,
    instance: IntegrationInstance,
    detail: boolean,
) {
    const artifacts = instance.artifacts.map(artifact => artifactView(context, artifact));
    return {
        id: instance.id,
        kind: instance.kind,
        label: instance.label,
        definitionVersion: instance.definitionVersion,
        status: instance.status,
        createdAt: instance.createdAt,
        updatedAt: instance.updatedAt,
        runCount: instance.runCount,
        lastRun: instance.runs.at(-1) ?? null,
        artifactCount: artifacts.length,
        missingArtifactCount: artifacts.filter(artifact => artifact.exists === false).length,
        artifacts,
        ...(detail ? {
            answers: instance.answersSnapshot,
            definition: instance.definitionSnapshot,
            secretInputs: instance.secretInputs,
            runs: instance.runs,
        } : {}),
    };
}

function artifactView(context: IntegrationArtifactContext, artifact: IntegrationArtifactResult) {
    return {
        ...artifact,
        exists: artifact.type === "dashboard"
            ? context.dashboardIds?.has(artifact.id) ?? "unknown"
            : context.sourceUrns?.has(artifact.id) ?? "unknown",
    };
}
