import type { IntegrationDefinition, SetupResourceRow } from "../../model";

export function resourceRows(definition: IntegrationDefinition): SetupResourceRow[] {
    return [
        ...(definition.artifacts ?? []).map(artifactRow),
        ...(definition.secrets ?? []).map(secret => ({
            type: "Secret",
            label: inputLabel(definition, secret.input),
            detail: `Secret key: ${secret.key}`,
        })),
        ...(definition.generatedSecrets ?? []).map(secret => ({
            type: "Secret",
            label: secret.name,
            detail: `Generated key: ${secret.key}`,
        })),
        ...(definition.connectors ?? []).map(connector => ({
            type: "Connector",
            label: connector.provider,
            detail: connector.root ? `Connector root: ${connector.root}` : "Connector deployment",
        })),
    ];
}

function artifactRow(artifact: NonNullable<IntegrationDefinition["artifacts"]>[number]): SetupResourceRow {
    if (artifact.type === "dashboard") {
        return { type: "Dashboard", label: artifact.dashboard.meta?.name ?? artifact.dashboard.id, detail: `Dashboard id: ${artifact.dashboard.id}` };
    }
    if (artifact.type === "bloc") return { type: "Bloc", label: artifact.bloc.name, detail: `Tag: ${artifact.bloc.tag}` };
    if (artifact.type === "function") {
        return { type: "Function", label: artifact.function.meta?.name ?? artifact.function.id, detail: `${artifact.function.method} ${artifact.function.id}` };
    }
    if (artifact.type === "sourceOverlay") {
        return { type: "Source overlay", label: artifact.overlay.label ?? artifact.overlay.id, detail: `Overlay id: ${artifact.overlay.id}` };
    }
    return { type: "Source", label: artifact.source.meta?.name ?? artifact.source.id, detail: `Source id: ${artifact.source.id}` };
}

function inputLabel(definition: IntegrationDefinition, inputName: string): string {
    return definition.inputs.find(input => input.name === inputName)?.label ?? inputName;
}
