import { parseUrn } from "@bernouy/cms-sources";
import { IntegrationInputError, IntegrationRuntimeError } from "../errors";
import { integrationInstallationId } from "../installation/ids";
import { sensitiveInputNames } from "../shared/inputSensitivity";
import type { IntegrationDefinition } from "../../interfaces/Integration";
import type { IntegrationInstallationRepository } from "../../interfaces/IntegrationInstallationRepository";
import type { DependencyTemplateContext } from "../templates";

export async function resolveDependencyContext(
    definition: IntegrationDefinition,
    installations: IntegrationInstallationRepository | undefined,
): Promise<DependencyTemplateContext> {
    const dependencies = definition.dependencies ?? [];
    if (!dependencies.length) {
        return {};
    }
    if (!installations) {
        throw new IntegrationRuntimeError("installations repository not configured");
    }

    const context: DependencyTemplateContext = {};
    for (const dependency of dependencies) {
        const id = integrationInstallationId(dependency.kind);
        const installation = await installations.get(id);
        if (!installation || installation.status !== "success") {
            if (dependency.optional) {
                continue;
            }
            throw new IntegrationInputError(
                `dependencies.${dependency.name}`,
                `requires integration "${dependency.kind}" to be installed`,
            );
        }
        const sourceIds = installation.artifacts
            .filter((artifact) => artifact.type === "source")
            .map((artifact) => parseUrn(artifact.id)?.source)
            .filter((sourceId): sourceId is string => typeof sourceId === "string" && sourceId.length > 0);
        const secretInputs = new Set([
            ...installation.secretInputs,
            ...Object.keys(installation.secretRefs),
            ...(installation.definitionSnapshot ? sensitiveInputNames(installation.definitionSnapshot) : []),
        ]);
        context[dependency.name] = {
            id: installation.id,
            answers: Object.fromEntries(
                Object.entries(installation.answersSnapshot).filter(([name]) => !secretInputs.has(name)),
            ),
            ...(sourceIds.length === 1 ? { sourceId: sourceIds[0]! } : {}),
        };
    }
    return context;
}
