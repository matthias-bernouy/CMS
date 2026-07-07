import type { ControlCms } from "cms-control/ControlCms";
import type { IntegrationArtifactResult, IntegrationInstance, IntegrationRun } from "@bernouy/cms-integrations";

export type IntegrationArtifactContext = {
    sourceUrns: Set<string> | null;
    functionIds: Set<string> | null;
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
    const functionIds = await (cms.functions
        ? cms.functions.getAllFunctions().then(functions => new Set(functions.map(fn => fn.id))).catch(() => null)
        : Promise.resolve(null));
    const blocIds = await cms.repository.getBlocsList()
        .then(blocs => new Set(blocs.map(bloc => bloc.id)))
        .catch(() => null);
    return { sourceUrns, functionIds, dashboardIds, blocIds };
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
        statusLabel: statusLabel(instance.status),
        createdAt: instance.createdAt,
        updatedAt: instance.updatedAt,
        updatedAtLabel: dateTimeLabel(instance.updatedAt),
        runCount: instance.runCount,
        lastRun: instance.runs.at(-1) ? runView(instance.runs.at(-1)!) : null,
        artifactCount: artifacts.length,
        missingArtifactCount: artifacts.filter(artifact => artifact.exists === false).length,
        artifacts,
        ...(detail ? {
            answers: instance.answersSnapshot,
            definition: instance.definitionSnapshot,
            secretInputs: instance.secretInputs,
            runs: instance.runs.map(runView),
        } : {}),
    };
}

function artifactView(context: IntegrationArtifactContext, artifact: IntegrationArtifactResult) {
    const exists = artifactExists(context, artifact);
    return {
        ...artifact,
        exists,
        actionLabel: actionLabel(artifact.action),
        existsLabel: existsLabel(exists),
        typeLabel: artifactTypeLabel(artifact.type),
    };
}

function artifactExists(context: IntegrationArtifactContext, artifact: IntegrationArtifactResult): boolean | "unknown" {
    if (artifact.type === "function") return context.functionIds?.has(artifact.id) ?? "unknown";
    if (artifact.type === "dashboard") return context.dashboardIds?.has(artifact.id) ?? "unknown";
    if (artifact.type === "bloc") return context.blocIds?.has(artifact.id) ?? "unknown";
    return context.sourceUrns?.has(artifact.id) ?? "unknown";
}

function runView(run: IntegrationRun) {
    return {
        ...run,
        statusLabel: statusLabel(run.status),
        startedAtLabel: dateTimeLabel(run.startedAt),
        finishedAtLabel: dateTimeLabel(run.finishedAt),
    };
}

function statusLabel(status: string): string {
    if (status === "success") return "Active";
    if (status === "failed") return "Failed";
    return "Pending";
}

function actionLabel(action: string): string {
    return action[0]!.toUpperCase() + action.slice(1);
}

function artifactTypeLabel(type: string): string {
    if (type === "sourceOverlay") return "Source overlay";
    return type[0]!.toUpperCase() + type.slice(1);
}

function existsLabel(exists: boolean | "unknown"): string {
    if (exists === true) return "Available";
    if (exists === false) return "Missing";
    return "Unknown";
}

function dateTimeLabel(value: Date): string {
    const date = new Date(value);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const time = new Intl.DateTimeFormat("en", {
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
    if (date.toDateString() === now.toDateString()) return `Today ${time}`;
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
    return new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(value);
}
