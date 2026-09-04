import {
    assertIntegrationVersionInstallable,
    assertRerunVersion,
    assertUpgradeEligible,
    IntegrationInputError,
    IntegrationRepositoryError,
    integrationVersionSatisfies,
    integrationRegistry,
    isExactIntegrationVersion,
    MissingIntegrationParam,
    parseIntegrationDefinition,
    resolveInstallableIntegrationDefinitionVersion,
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
    const index = await repository.getIndex(integrationId);
    if (!index) {
        throw new IntegrationInputError("version", `unknown integration version "${integrationId}@${version}"`);
    }
    assertUpgradeEligible(index, version);
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
    const manualDefinition = body.definition === undefined ? undefined : parseIntegrationDefinition(body.definition);
    const requestedKind = text(body.kind);
    if (manualDefinition && requestedKind && manualDefinition.kind !== requestedKind) {
        throw new IntegrationInputError(
            "definition",
            "manual definition kind does not match the requested integration kind",
        );
    }
    const kind = requestedKind ?? manualDefinition?.kind;
    if (!kind) {
        return [];
    }
    const requestedVersion = text(body.version) ?? manualDefinition?.version;
    const index = await repository.getIndex(kind);
    if (!index) {
        const legacyDefinition = await repository.get(kind, requestedVersion);
        rejectManualRepositoryOverride(manualDefinition, legacyDefinition);
        return legacyDefinition ? [legacyDefinition] : [];
    }
    rejectManualRepositoryOverride(manualDefinition, true);
    const selected = requestedVersion
        ? assertIntegrationVersionInstallable(index, requestedVersion)
        : resolveInstallableIntegrationDefinitionVersion(index, undefined, "stable");
    if (!selected) {
        throw new IntegrationInputError("version", `integration "${kind}" has no installable version`);
    }
    const definition = await repository.get(kind, selected.version);
    if (!definition || definition.schema !== "cms.integration.definition.v2" || definition.type !== "collection") {
        return definition ? [definition] : [];
    }
    return [definition, ...(await collectionDependencyDefinitions(repository, definition))];
}

async function sourceDefinitionClosure(
    repository: IntegrationDefinitionRepository,
    initialKinds: readonly string[],
): Promise<IntegrationDefinition[]> {
    const definitions = new Map<string, IntegrationDefinition>();
    const pending = [...initialKinds];
    while (pending.length) {
        const kind = pending.shift()!;
        if (definitions.has(kind)) {
            continue;
        }
        const definition = await repository.get(kind);
        if (!definition) {
            continue;
        }
        definitions.set(kind, definition);
        pending.push(
            ...(definition.dependencies ?? []).filter(({ optional }) => !optional).map((dependency) => dependency.kind),
        );
    }
    return [...definitions.values()];
}

function rejectManualRepositoryOverride(
    manualDefinition: IntegrationDefinition | undefined,
    repositoryDefinition: IntegrationDefinition | true | null,
): void {
    if (manualDefinition && repositoryDefinition) {
        throw new IntegrationInputError(
            "definition",
            `integration "${manualDefinition.kind}" is repository-managed and cannot be installed from a manual definition`,
        );
    }
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
    const definitions = await installedIntegrationDefinitions(repository, installations, packageResolver, [
        integrationId,
    ]);
    if (installation.definitionSnapshot) {
        definitions.unshift(installation.definitionSnapshot);
    } else if (installation.definitionVersion !== "unversioned" && !packageResolver) {
        const definition = await repository.get(installation.id, installation.definitionVersion);
        if (definition) {
            definitions.unshift(definition);
        }
    }
    const unique = uniqueDefinitions(definitions);
    const collection = unique.find(({ kind }) => kind === installation.id);
    if (collection?.schema !== "cms.integration.definition.v2" || collection.type !== "collection") {
        return unique;
    }
    return uniqueDefinitions([...unique, ...(await collectionDependencyDefinitions(repository, collection))]);
}

export async function collectionDependencyDefinitions(
    repository: IntegrationDefinitionRepository,
    definition: IntegrationDefinition,
): Promise<IntegrationDefinition[]> {
    if (definition.schema !== "cms.integration.definition.v2" || definition.type !== "collection") {
        return [];
    }
    const collections = new Map<string, IntegrationDefinition>();
    const pending = [
        ...definition.resources.flatMap((resource) => resource.requires?.collections ?? []),
        ...(definition.theme?.dependencies ?? []),
    ];
    while (pending.length) {
        const requirement = pending.shift()!;
        if (collections.has(requirement.kind)) {
            continue;
        }
        const dependency = await repository.get(requirement.kind);
        if (
            !dependency ||
            dependency.schema !== "cms.integration.definition.v2" ||
            dependency.type !== "collection" ||
            !dependency.version ||
            !integrationVersionSatisfies(dependency.version, requirement.versionRange)
        ) {
            throw new IntegrationInputError(
                "resources",
                `required collection "${requirement.kind}" at ${requirement.versionRange} is unavailable`,
            );
        }
        collections.set(dependency.kind, dependency);
        pending.push(
            ...dependency.resources.flatMap((resource) => resource.requires?.collections ?? []),
            ...(dependency.theme?.dependencies ?? []),
        );
    }
    const allCollections = [definition, ...collections.values()].filter(
        (candidate) => candidate.schema === "cms.integration.definition.v2" && candidate.type === "collection",
    );
    const sourceKinds = [
        ...new Set(
            allCollections.flatMap((collection) =>
                collection.resources.flatMap((resource) => (resource.endpoints ?? []).map(({ source }) => source)),
            ),
        ),
    ];
    return [...collections.values(), ...(await sourceDefinitionClosure(repository, sourceKinds))];
}

/** @deprecated Use collectionDependencyDefinitions. */
export const collectionSourceDefinitions = collectionDependencyDefinitions;

function uniqueDefinitions(definitions: readonly IntegrationDefinition[]): IntegrationDefinition[] {
    const unique = new Map<string, IntegrationDefinition>();
    for (const definition of definitions) {
        if (!unique.has(definition.kind)) {
            unique.set(definition.kind, definition);
        }
    }
    return [...unique.values()];
}

export async function installedIntegrationDefinitions(
    repository: IntegrationDefinitionRepository,
    installations: IntegrationInstallationRepository,
    packageResolver?: IntegrationPackageResolver,
    excludedKinds: readonly string[] = [],
): Promise<IntegrationDefinition[]> {
    const definitions: IntegrationDefinition[] = [];
    const excluded = new Set(excludedKinds);
    for (const installation of await installations.list()) {
        if (installation.status !== "success" || excluded.has(installation.id)) {
            continue;
        }
        if (installation.definitionSnapshot) {
            definitions.push(installation.definitionSnapshot);
            continue;
        }
        if (!isExactIntegrationVersion(installation.definitionVersion)) {
            continue;
        }
        if (packageResolver) {
            const resolved = await packageResolver.resolve({
                kind: installation.id,
                version: installation.definitionVersion,
                reason: "rerun",
                expectedDigest: installation.packageDigest,
                allowEmbeddedFallback: !installation.packageDigest,
            });
            definitions.push(resolved.definition);
            continue;
        }
        const definition = await repository.get(installation.id, installation.definitionVersion);
        if (definition) {
            definitions.push(definition);
        }
    }
    return definitions;
}

function compact<T>(values: Array<T | null | undefined>): T[] {
    return values.filter((value): value is T => value !== null && value !== undefined);
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
