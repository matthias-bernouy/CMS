import type { IntegrationDefinition } from "../../model";

export function artifactLabels(definition: IntegrationDefinition): string[] {
    const types = Array.from(new Set((definition.artifacts ?? []).map(artifact => artifact.type)));
    return types.length ? types.map(typeLabel) : ["No artifacts"];
}

export function formatRelativeDate(value: string | undefined): string {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
    if (date.toDateString() === now.toDateString()) return `Today ${time}`;
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function statusLabel(status: string): string {
    if (status === "success") return "Active";
    if (status === "failed") return "Failed";
    return "Pending";
}

function typeLabel(type: string): string {
    if (type === "sourceOverlay") return "Source overlay";
    return type[0]!.toUpperCase() + type.slice(1);
}
