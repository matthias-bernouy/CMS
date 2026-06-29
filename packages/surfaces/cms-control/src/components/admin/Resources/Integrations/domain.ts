import type { IntegrationAnswerValue, IntegrationDefinition, IntegrationInstanceRow } from "./model";

export function installedCounts(instances: IntegrationInstanceRow[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const instance of instances) counts.set(instance.kind, (counts.get(instance.kind) ?? 0) + 1);
    return counts;
}

export function categories(definitions: IntegrationDefinition[]): string[] {
    return Array.from(new Set(definitions.map(definition => definition.category ?? "Other"))).sort();
}

export function matches(definition: IntegrationDefinition, query: string, category: string): boolean {
    const text = [definition.kind, definition.label, definition.category, definition.description]
        .join(" ")
        .toLowerCase();
    const categoryMatch = !category || category === (definition.category ?? "Other");
    return categoryMatch && (!query || text.includes(query.toLowerCase()));
}

export function artifactSummary(definition: IntegrationDefinition): string {
    const types = Array.from(new Set((definition.artifacts ?? []).map(artifact => artifact.type)));
    if (!types.length) return "No declared artifacts";
    return types.map(type => type[0]!.toUpperCase() + type.slice(1)).join(", ");
}

export function mark(definition: IntegrationDefinition): string {
    return (definition.label.trim()[0] || definition.kind.trim()[0] || "I").toUpperCase();
}

export function defaultInstance(
    definition: IntegrationDefinition,
    answers: Record<string, IntegrationAnswerValue>,
): { id: string; label: string } | undefined {
    return typeof answers.id === "string" && answers.id.trim()
        ? undefined
        : { id: `${definition.kind}:${definition.kind}`, label: definition.label };
}
