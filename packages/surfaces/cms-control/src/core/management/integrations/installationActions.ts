import type { ControlCms } from "cms-control/ControlCms";
import { importBlocArtifact } from "cms-control/core/content/bloc/importBlocArtifact";
import { deleteIntegrationBlocArtifact } from "cms-control/core/content/bloc/deleteIntegrationBlocArtifact";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { publishedPageResolver } from "cms-control/core/management/integrations/publishedPageResolver";
import {
    assertCollectionConformance,
    IntegrationInputError,
    integrationVersionSatisfies,
    parseIntegrationImportDto,
    resolveCollectionSelection,
    runIntegrationInstallation,
    type IntegrationDefinition,
    type IntegrationImportDeps,
    type IntegrationImportRequest,
} from "@bernouy/cms-integrations";

export function integrationInstallationDeps(cms: ControlCms): IntegrationImportDeps {
    const blocRepository = cms.integrationBlocRepository ?? cms.repository;
    return {
        sources: cms.sources,
        ...(cms.functions ? { functions: cms.functions } : {}),
        roles: cms.roles,
        secrets: cms.secrets,
        dashboards: cms.dashboards,
        dashboardViews: cms.dashboardViews,
        dashboardAssignments: cms.dashboardAssignments,
        relations: cms.relations,
        installations: cms.integrationInstallations,
        ...(cms.triggers ? { triggers: cms.triggers } : {}),
        ...(cms.sourceOverlays ? { sourceOverlays: cms.sourceOverlays } : {}),
        blocs: {
            importBloc: (artifact, options, context) =>
                importBlocArtifact(
                    cms,
                    { ...artifact, force: options.force },
                    {
                        repository: blocRepository,
                        ownership: {
                            kind: "integration",
                            integrationKind: context.integrationKind,
                            installationId: context.installationId,
                            definitionVersion: context.definitionVersion,
                        },
                    },
                ),
            deleteBloc: (id, installationId) => deleteIntegrationBlocArtifact(cms, blocRepository, id, installationId),
        },
        connectorDeployers: cms.integrationConnectorDeployers,
        ...(cms.integrationMigrationRuntime ? { migrationRuntime: cms.integrationMigrationRuntime } : {}),
        provisioners: cms.integrationProvisioners,
        sourceExecutorDeps: cms.sourceExecutorDeps,
        sourceTargetValidation: cms.config?.sourceTargetValidation,
        resolvePublishedPage: publishedPageResolver(cms.repository, cms.config?.deliveryUrl),
    };
}

export async function installRequiredCollectionSources(
    cms: ControlCms,
    request: IntegrationImportRequest,
    deps: IntegrationImportDeps,
): Promise<void> {
    const collection = request.siteIntegrations.find(({ kind }) => kind === request.dto.kind);
    if (!collection || collection.schema !== "cms.integration.definition.v2" || collection.type !== "collection") {
        return;
    }
    const installedCollection = await cms.integrationInstallations.get(collection.kind);
    const selection = resolveCollectionSelection(
        collection,
        request.dto.resources,
        installedCollection?.activeResources,
        request.siteIntegrations,
    );
    assertCollectionConformance(collection, request.siteIntegrations, selection.activeResources);
    const installing = new Set<string>();
    for (const dependency of collection.theme?.dependencies ?? []) {
        const definition = request.siteIntegrations.find(({ kind }) => kind === dependency.kind);
        if (
            !definition?.version ||
            (dependency.versionRange && !integrationVersionSatisfies(definition.version, dependency.versionRange))
        ) {
            throw new IntegrationInputError(
                "resources",
                `required integration "${dependency.kind}"${dependency.versionRange ? ` at ${dependency.versionRange}` : ""} is unavailable`,
            );
        }
        if (definition.schema === "cms.integration.definition.v2" && definition.type === "collection") {
            await installCollection(
                { kind: definition.kind, version: definition.version },
                request.siteIntegrations,
                cms,
                deps,
            );
            continue;
        }
        await installSource(
            {
                kind: dependency.kind,
                ...(dependency.versionRange ? { versionRange: dependency.versionRange } : {}),
            },
            request.siteIntegrations,
            cms,
            deps,
            installing,
        );
    }
    for (const requirement of selection.requiredSources) {
        await installSource(requirement, request.siteIntegrations, cms, deps, installing);
    }
    for (const requirement of selection.requiredCollections) {
        await installCollection(requirement, request.siteIntegrations, cms, deps);
    }
}

async function installCollection(
    requirement: { kind: string; version: string },
    definitions: readonly IntegrationDefinition[],
    cms: ControlCms,
    deps: IntegrationImportDeps,
): Promise<void> {
    const installed = await cms.integrationInstallations.get(requirement.kind);
    if (installed) {
        if (installed.status !== "success" || installed.definitionVersion !== requirement.version) {
            throw new IntegrationInputError(
                "resources",
                `collection "${requirement.kind}" must be active at ${requirement.version}`,
            );
        }
        return;
    }
    const definition = definitions.find(
        (candidate) =>
            candidate.kind === requirement.kind &&
            candidate.schema === "cms.integration.definition.v2" &&
            candidate.type === "collection" &&
            candidate.version === requirement.version,
    );
    if (!definition) {
        throw new IntegrationInputError(
            "resources",
            `required collection "${requirement.kind}" at ${requirement.version} is unavailable`,
        );
    }
    const dto = parseIntegrationImportDto({ kind: definition.kind, resources: [] }, [...definitions]);
    await runIntegrationInstallation({
        mode: "create",
        deps,
        installations: cms.integrationInstallations,
        dto,
        siteIntegrations: [...definitions],
        packageResolver: cms.integrationPackageResolver,
    });
}

async function installSource(
    requirement: { kind: string; versionRange?: string },
    definitions: readonly IntegrationDefinition[],
    cms: ControlCms,
    deps: IntegrationImportDeps,
    installing: Set<string>,
): Promise<void> {
    const installed = await cms.integrationInstallations.get(requirement.kind);
    if (installed) {
        if (
            installed.status !== "success" ||
            (requirement.versionRange &&
                !integrationVersionSatisfies(installed.definitionVersion, requirement.versionRange))
        ) {
            throw new IntegrationInputError(
                "resources",
                `source "${requirement.kind}" must be active${requirement.versionRange ? ` at ${requirement.versionRange}` : ""}`,
            );
        }
        return;
    }
    if (installing.has(requirement.kind)) {
        throw new IntegrationInputError("resources", `source dependency cycle includes "${requirement.kind}"`);
    }
    installing.add(requirement.kind);
    const definition = matchingSourceDefinition(definitions, requirement);
    for (const dependency of (definition.dependencies ?? []).filter(({ optional }) => !optional)) {
        await installSource(
            { kind: dependency.kind, ...(dependency.versionRange ? { versionRange: dependency.versionRange } : {}) },
            definitions,
            cms,
            deps,
            installing,
        );
    }
    const dto = parseIntegrationImportDto({ kind: definition.kind }, [...definitions]);
    await runIntegrationInstallation({
        mode: "create",
        deps,
        installations: cms.integrationInstallations,
        dto,
        siteIntegrations: [...definitions],
        packageResolver: cms.integrationPackageResolver,
    });
    installing.delete(requirement.kind);
}

function matchingSourceDefinition(
    definitions: readonly IntegrationDefinition[],
    requirement: { kind: string; versionRange?: string },
): IntegrationDefinition {
    const definition = definitions.find(({ kind }) => kind === requirement.kind);
    if (
        !definition ||
        definition.schema !== "cms.integration.definition.v2" ||
        definition.type !== "source" ||
        !definition.version ||
        (requirement.versionRange && !integrationVersionSatisfies(definition.version, requirement.versionRange))
    ) {
        throw new IntegrationInputError(
            "resources",
            `required source "${requirement.kind}"${requirement.versionRange ? ` at ${requirement.versionRange}` : ""} is unavailable`,
        );
    }
    return definition;
}

export async function readInstallationActionBody(req: Request): Promise<Record<string, unknown>> {
    const text = await req.text();
    if (!text.trim()) {
        return {};
    }
    let body: unknown;
    try {
        body = JSON.parse(text);
    } catch {
        throw new InvalidParam("body", "JSON object expected.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new InvalidParam("body", "JSON object expected.");
    }
    return body as Record<string, unknown>;
}
