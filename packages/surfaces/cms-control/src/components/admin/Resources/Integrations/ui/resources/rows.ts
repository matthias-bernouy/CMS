import type { IntegrationDefinition, SetupResourceRow } from "../../model";

export function resourceRows(definition: IntegrationDefinition): SetupResourceRow[] {
    return [
        ...(definition.artifacts ?? []).map(artifactRow).filter((row): row is SetupResourceRow => row !== null),
        ...(definition.secrets ?? []).map((secret) => ({
            type: "Secret",
            label: inputLabel(definition, secret.input),
            detail: `Secret key: ${secret.key}`,
        })),
        ...(definition.generatedSecrets ?? []).map((secret) => ({
            type: "Secret",
            label: secret.name,
            detail: `Generated key: ${secret.key}`,
        })),
        ...(definition.connectors ?? []).map((connector) => ({
            type: "Connector",
            label: connector.provider,
            detail: connector.root ? `Connector root: ${connector.root}` : "Connector deployment",
        })),
    ];
}

function artifactRow(artifact: NonNullable<IntegrationDefinition["artifacts"]>[number]): SetupResourceRow | null {
    if (artifact.type === "function" || artifact.type === "trigger") {
        return null;
    }
    if (artifact.type === "dashboard") {
        return {
            type: "Dashboard",
            label: artifact.dashboard.meta?.name ?? artifact.dashboard.id,
            detail: `Dashboard id: ${artifact.dashboard.id}`,
        };
    }
    if (artifact.type === "dashboard-view") {
        return {
            type: "Dashboard view",
            label: artifact.view.meta.name,
            detail: `View id: ${artifact.view.id}`,
        };
    }
    if (artifact.type === "bloc") {
        return { type: "Bloc", label: artifact.bloc.name, detail: `Tag: ${artifact.bloc.tag}` };
    }
    if (artifact.type === "sourceOverlay") {
        return {
            type: "Source overlay",
            label: artifact.overlay.label ?? artifact.overlay.id,
            detail: `Overlay id: ${artifact.overlay.id}`,
        };
    }
    if (artifact.type === "relation") {
        return {
            type: "Relation",
            label: artifact.relation.label ?? artifact.relation.id,
            detail: `Relation id: ${artifact.relation.id}`,
        };
    }
    if (artifact.type === "dashboardRelation") {
        return {
            type: "Dashboard relation",
            label: artifact.projection.title ?? artifact.projection.relationId,
            detail: `${artifact.projection.dashboardId}.${artifact.projection.viewId}`,
        };
    }
    return {
        type: "Source",
        label: artifact.source.meta?.name ?? artifact.source.id,
        detail: `Source id: ${artifact.source.id}`,
    };
}

function inputLabel(definition: IntegrationDefinition, inputName: string): string {
    return definition.inputs.find((input) => input.name === inputName)?.label ?? inputName;
}
