import type { IntegrationArtifactResult, IntegrationInstallation, IntegrationRun } from "@bernouy/cms-integrations";
import type { IntegrationArtifactContext } from "./artifactContext";

export { loadIntegrationArtifactContext, type IntegrationArtifactContext } from "./artifactContext";

export function buildIntegrationInstallationView(
    context: IntegrationArtifactContext,
    installation: IntegrationInstallation,
    detail: boolean,
) {
    const artifacts = installation.artifacts.map((artifact) => artifactView(context, artifact));
    return {
        id: installation.id,
        label: installation.label,
        definitionVersion: installation.definitionVersion,
        ...(installation.packageDigest ? { packageDigest: installation.packageDigest } : {}),
        status: installation.status,
        statusLabel: statusLabel(installation.status),
        createdAt: installation.createdAt,
        updatedAt: installation.updatedAt,
        updatedAtLabel: dateTimeLabel(installation.updatedAt),
        runCount: installation.runCount,
        lastRun: installation.runs.at(-1) ? runView(installation.runs.at(-1)!) : null,
        artifactCount: artifacts.length,
        missingArtifactCount: artifacts.filter((artifact) => artifact.exists === false).length,
        artifacts,
        ...(detail
            ? {
                  answers: installation.answersSnapshot,
                  definition: installation.definitionSnapshot,
                  secretInputs: installation.secretInputs,
                  ...(installation.activeResources ? { activeResources: installation.activeResources } : {}),
                  connectorBaselineAdoptions: (installation.connectorBaselineAdoptions ?? []).map((audit) => ({
                      ...audit,
                      adoptedAtLabel: dateTimeLabel(audit.adoptedAt),
                  })),
                  migrationOperation: installation.migrationOperation
                      ? migrationOperationView(installation.migrationOperation)
                      : null,
                  runs: installation.runs.map(runView),
              }
            : {}),
    };
}

function migrationOperationView(operation: NonNullable<IntegrationInstallation["migrationOperation"]>) {
    return {
        id: operation.id,
        revision: operation.revision,
        status: operation.status,
        currentVersion: operation.currentVersion,
        targetVersion: operation.targetVersion,
        startedAt: operation.startedAt,
        updatedAt: operation.updatedAt,
        activatedAt: operation.activatedAt,
        pointOfNoReturnReachedAt: operation.pointOfNoReturnReachedAt,
        journal: operation.journal.map((entry) => ({
            phase: entry.phase,
            status: entry.status,
            error: entry.error,
        })),
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
    if (artifact.type === "function") {
        return context.functionIds?.has(artifact.id) ?? "unknown";
    }
    if (artifact.type === "dashboard") {
        return context.dashboardIds?.has(artifact.id) ?? "unknown";
    }
    if (artifact.type === "dashboard-view") {
        return context.dashboardViewIds?.has(artifact.id) ?? "unknown";
    }
    if (artifact.type === "sourceOverlay") {
        return context.sourceOverlayIds?.has(artifact.id) ?? "unknown";
    }
    if (artifact.type === "relation") {
        return context.relationIds?.has(artifact.id) ?? "unknown";
    }
    if (artifact.type === "dashboardRelation") {
        return context.dashboardRelationProjectionIds?.has(artifact.id) ?? "unknown";
    }
    if (artifact.type === "bloc") {
        return context.blocIds?.has(artifact.id) ?? "unknown";
    }
    if (artifact.type === "trigger") {
        return context.triggerIds?.has(artifact.id) ?? "unknown";
    }
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
    if (status === "success") {
        return "Active";
    }
    if (status === "failed") {
        return "Failed";
    }
    return "Pending";
}

function actionLabel(action: string): string {
    return action[0]!.toUpperCase() + action.slice(1);
}

function artifactTypeLabel(type: string): string {
    if (type === "sourceOverlay") {
        return "Source overlay";
    }
    if (type === "dashboardRelation") {
        return "Dashboard relation";
    }
    if (type === "dashboard-view") {
        return "Dashboard view";
    }
    return type[0]!.toUpperCase() + type.slice(1);
}

function existsLabel(exists: boolean | "unknown"): string {
    if (exists === true) {
        return "Available";
    }
    if (exists === false) {
        return "Missing";
    }
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
    if (date.toDateString() === now.toDateString()) {
        return `Today ${time}`;
    }
    if (date.toDateString() === yesterday.toDateString()) {
        return `Yesterday ${time}`;
    }
    return new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(value);
}
