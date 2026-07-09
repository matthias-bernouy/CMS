import type { ControlCms } from "cms-control/ControlCms";
import type { IntegrationArtifactResult, IntegrationInstallation, IntegrationRun } from "@bernouy/cms-integrations";
import { dashboardRelationProjectionId } from "@bernouy/cms-relations";

export type IntegrationArtifactContext = {
    sourceUrns: Set<string> | null;
    sourceOverlayIds: Set<string> | null;
    functionIds: Set<string> | null;
    dashboardIds: Set<string> | null;
    relationIds: Set<string> | null;
    dashboardRelationProjectionIds: Set<string> | null;
    blocIds: Set<string> | null;
};

export async function loadIntegrationArtifactContext(cms: ControlCms): Promise<IntegrationArtifactContext> {
    const sourceUrns = await cms.sources.getAllSources()
        .then(sources => new Set(sources.map(source => source.urn)))
        .catch(() => null);
    const sourceOverlayIds = await (cms.sourceOverlays
        ? cms.sourceOverlays.getAllOverlays().then(overlays => new Set(overlays.map(overlay => overlay.id))).catch(() => null)
        : Promise.resolve(null));
    const dashboardIds = await cms.dashboards.getAllDashboards()
        .then(dashboards => new Set(dashboards.map(dashboard => dashboard.id)))
        .catch(() => null);
    const relationIds = await cms.relations.getAllRelations()
        .then(relations => new Set(relations.map(relation => relation.id)))
        .catch(() => null);
    const dashboardRelationProjectionIds = await cms.relations.getAllDashboardRelationProjections()
        .then(projections => new Set(projections.map(dashboardRelationProjectionId)))
        .catch(() => null);
    const functionIds = await (cms.functions
        ? cms.functions.getAllFunctions().then(functions => new Set(functions.map(fn => fn.id))).catch(() => null)
        : Promise.resolve(null));
    const blocIds = await cms.repository.getBlocsList()
        .then(blocs => new Set(blocs.map(bloc => bloc.id)))
        .catch(() => null);
    return { sourceUrns, sourceOverlayIds, functionIds, dashboardIds, relationIds, dashboardRelationProjectionIds, blocIds };
}

export function buildIntegrationInstallationView(
    context: IntegrationArtifactContext,
    installation: IntegrationInstallation,
    detail: boolean,
) {
    const artifacts = installation.artifacts.map(artifact => artifactView(context, artifact));
    return {
        id: installation.id,
        label: installation.label,
        definitionVersion: installation.definitionVersion,
        status: installation.status,
        statusLabel: statusLabel(installation.status),
        createdAt: installation.createdAt,
        updatedAt: installation.updatedAt,
        updatedAtLabel: dateTimeLabel(installation.updatedAt),
        runCount: installation.runCount,
        lastRun: installation.runs.at(-1) ? runView(installation.runs.at(-1)!) : null,
        artifactCount: artifacts.length,
        missingArtifactCount: artifacts.filter(artifact => artifact.exists === false).length,
        artifacts,
        ...(detail ? {
            answers: installation.answersSnapshot,
            definition: installation.definitionSnapshot,
            secretInputs: installation.secretInputs,
            runs: installation.runs.map(runView),
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
    if (artifact.type === "sourceOverlay") return context.sourceOverlayIds?.has(artifact.id) ?? "unknown";
    if (artifact.type === "relation") return context.relationIds?.has(artifact.id) ?? "unknown";
    if (artifact.type === "dashboardRelation") return context.dashboardRelationProjectionIds?.has(artifact.id) ?? "unknown";
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
    if (type === "dashboardRelation") return "Dashboard relation";
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
