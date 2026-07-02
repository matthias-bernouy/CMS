import type { ControlCms } from "cms-control/ControlCms";
import type { IntegrationArtifactResult, IntegrationInstance } from "@bernouy/cms-integrations";

export type IntegrationArtifactContext = {
    sourceUrns: Set<string> | null;
    dashboardIds: Set<string> | null;
    blocIds: Set<string> | null;
};

export async function loadIntegrationArtifactContext(cms: ControlCms): Promise<IntegrationArtifactContext> {
    const sourceUrns = await cms.sources.getAllSources()
        .then(sources => new Set(sources.map(source => source.urn)))
        .catch(() => null);
    const dashboardIds = await cms.dashboards.getAllDashboards()
        .then(dashboards => new Set(dashboards.map(dashboard => dashboard.id)))
        .catch(() => null);
    const blocIds = await cms.repository.getBlocsList()
        .then(blocs => new Set(blocs.map(bloc => bloc.id)))
        .catch(() => null);
    return { sourceUrns, dashboardIds, blocIds };
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
    const exists = artifactExists(context, artifact);
    return {
        ...artifact,
        exists,
    };
}

function artifactExists(context: IntegrationArtifactContext, artifact: IntegrationArtifactResult): boolean | "unknown" {
    if (artifact.type === "dashboard") return context.dashboardIds?.has(artifact.id) ?? "unknown";
    if (artifact.type === "bloc") return context.blocIds?.has(artifact.id) ?? "unknown";
    return context.sourceUrns?.has(artifact.id) ?? "unknown";
}
