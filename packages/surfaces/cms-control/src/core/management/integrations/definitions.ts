import {
    assertRerunVersion,
    IntegrationInputError,
    IntegrationRepositoryError,
    integrationRegistry,
    MissingIntegrationParam,
    type IntegrationDefinition,
    type IntegrationDefinitionRepository,
    type IntegrationInstallationRepository,
    type IntegrationPackageResolver,
} from "@bernouy/cms-integrations";

export async function listIntegrationDefinitions(
    repository: IntegrationDefinitionRepository,
): Promise<IntegrationDefinition[]> {
    const summaries = await repository.list();
    const definitions = await Promise.all(
        summaries.map(async (summary) => {
            try {
                return await repository.get(summary.kind);
            } catch (error) {
                if (error instanceof IntegrationRepositoryError) {
                    throw error;
                }
                return null;
            }
        }),
    );
    return integrationRegistry(compact(definitions));
}

export async function definitionForUpgrade(
    repository: IntegrationDefinitionRepository,
    integrationId: string,
    body: Record<string, unknown>,
): Promise<IntegrationDefinition> {
    const version = text(body.version);
    if (!version) {
        throw new MissingIntegrationParam("version");
    }
    const definition = await repository.get(integrationId, version);
    if (!definition) {
        throw new IntegrationInputError("version", `unknown integration version "${integrationId}@${version}"`);
    }
    return definition;
}

export async function definitionsForImport(
    repository: IntegrationDefinitionRepository,
    body: Record<string, unknown>,
): Promise<IntegrationDefinition[]> {
    const kind = text(body.kind);
    if (!kind) {
        return [];
    }
    const definition = await repository.get(kind, text(body.version));
    return definition ? [definition] : [];
}

export async function definitionsForRerun(
    repository: IntegrationDefinitionRepository,
    installations: IntegrationInstallationRepository,
    integrationId: string,
    body: Record<string, unknown>,
    packageResolver?: IntegrationPackageResolver,
): Promise<IntegrationDefinition[]> {
    const installation = await installations.get(integrationId);
    if (!installation) {
        return [];
    }
    assertRerunVersion(installation, body.version);
    if (installation.definitionSnapshot) {
        return [installation.definitionSnapshot];
    }
    if (installation.definitionVersion === "unversioned") {
        return [];
    }
    if (packageResolver) {
        return [];
    }
    const definition = await repository.get(installation.id, installation.definitionVersion);
    return definition ? [definition] : [];
}

function compact<T>(values: Array<T | null | undefined>): T[] {
    return values.filter((value): value is T => value !== null && value !== undefined);
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
