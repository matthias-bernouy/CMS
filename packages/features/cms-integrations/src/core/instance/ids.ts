import type { IntegrationAnswerValue } from "../../interfaces/Integration";

export function createIntegrationInstanceId(
    kind: string,
    answers: Record<string, IntegrationAnswerValue>,
    instance?: { id?: string; label?: string },
): string | null {
    const explicit = cleanText(instance?.id);
    if (explicit) return explicit;
    const answerId = cleanText(answers.id);
    if (answerId) return `${kind}:${answerId}`;
    const label = cleanText(instance?.label);
    return label ? `${kind}:${slug(label)}` : null;
}

export function cleanText(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function hasAnswer(value: unknown): boolean {
    return value !== undefined && value !== null && value !== "";
}

function slug(value: string): string {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "instance";
}
