import {
    integrationRegistry,
    type IntegrationDefinition,
    type IntegrationDefinitionRepository,
    type IntegrationInstallationRepository,
} from "@bernouy/cms-integrations";

export async function listIntegrationDefinitions(
    repository: IntegrationDefinitionRepository,
): Promise<IntegrationDefinition[]> {
    const summaries = await repository.list();
    const definitions = await Promise.all(summaries.map(async (summary) => {
        try {
            return await repository.get(summary.kind);
        } catch {
            return null;
        }
    }));
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
    installations: IntegrationInstallationRepository,
    integrationId: string,
    body: Record<string, unknown>,
): Promise<IntegrationDefinition[]> {
    const installation = await installations.get(integrationId);
    if (!installation) return [];
    const definition = await repository.get(installation.id, text(body.version));
    return definition ? [definition] : [];
}

function compact<T>(values: Array<T | null | undefined>): T[] {
    return values.filter((value): value is T => value !== null && value !== undefined);
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
