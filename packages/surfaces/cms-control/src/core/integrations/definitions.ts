import {
    integrationRegistry,
    type IntegrationDefinition,
    type IntegrationDefinitionRepository,
    type IntegrationInstanceRepository,
} from "@bernouy/cms-integrations";

export async function listIntegrationDefinitions(
    repository: IntegrationDefinitionRepository,
): Promise<IntegrationDefinition[]> {
    const summaries = await repository.list();
    const definitions = await Promise.all(summaries.map(summary => repository.get(summary.kind)));
    return integrationRegistry(compact(definitions));
}

export async function definitionsForImport(
    repository: IntegrationDefinitionRepository,
    body: Record<string, unknown>,
): Promise<IntegrationDefinition[]> {
    const kind = text(body.kind);
    if (!kind) return [];
    const definition = await repository.get(kind, text(body.version));
    return definition ? [definition] : [];
}

export async function definitionsForRerun(
    repository: IntegrationDefinitionRepository,
    instances: IntegrationInstanceRepository,
    instanceId: string,
    body: Record<string, unknown>,
): Promise<IntegrationDefinition[]> {
    const instance = await instances.get(instanceId);
    if (!instance) return [];
    const definition = await repository.get(instance.kind, text(body.version));
    return definition ? [definition] : [];
}

function compact<T>(values: Array<T | null | undefined>): T[] {
    return values.filter((value): value is T => value !== null && value !== undefined);
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
