import { executeFunction, validateFunction, type CmsFunction } from "@bernouy/cms-functions";
import { secretKeyToRef } from "@bernouy/cms-secrets";
import { IntegrationInputError, IntegrationRuntimeError } from "../../errors";
import { resolveDependencyContext } from "../../import/dependencies";
import { resolveIntegrationInputs } from "../../definitions/resolvedInputs";
import { resolveTemplates, type TemplateContext } from "../../definitions/templates";
import type { DeclarativeAfterInstallationTemplate, IntegrationDefinition } from "../../../interfaces/Integration";
import type { IntegrationImportDeps } from "../../../interfaces/IntegrationImport";
import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../interfaces/IntegrationInstallationRepository";
import { integrationInstallationId } from "../ids";
import { markAfterInstallationFailed } from "./afterInstallationFailure";

export async function reconcileChangedInstallation(
    deps: IntegrationImportDeps,
    installations: IntegrationInstallationRepository,
    changedInstallationId: string,
): Promise<void> {
    await reconcileAfterInstallation(deps, installations, changedInstallationId, "changed");
}

export async function reconcileDependentInstallations(
    deps: IntegrationImportDeps,
    installations: IntegrationInstallationRepository,
    changedInstallationId: string,
): Promise<void> {
    await reconcileAfterInstallation(deps, installations, changedInstallationId, "dependents");
}

async function reconcileAfterInstallation(
    deps: IntegrationImportDeps,
    installations: IntegrationInstallationRepository,
    changedInstallationId: string,
    scope: "changed" | "dependents",
): Promise<void> {
    const installed = await installations.list();
    for (const installation of installed) {
        const definition = installation.definitionSnapshot;
        if (installation.status !== "success" || !definition?.afterInstallation?.length) {
            continue;
        }
        const isChanged = installation.id === changedInstallationId;
        if ((scope === "changed") !== isChanged) {
            continue;
        }
        const actions = definition.afterInstallation.filter(
            (action) => isChanged || isAffected(definition, action, changedInstallationId),
        );
        if (!actions.length) {
            continue;
        }
        const dependencies = await resolveDependencyContext(definition, installations);
        for (const action of actions) {
            if ((action.requires ?? []).some((name) => !dependencies[name])) {
                continue;
            }
            try {
                await executeAction(deps, definition, installation, dependencies, action);
            } catch (error) {
                await markAfterInstallationFailed(installations, installation.id, error);
                throw error;
            }
        }
    }
}

function isAffected(
    definition: IntegrationDefinition,
    action: DeclarativeAfterInstallationTemplate,
    changedInstallationId: string,
): boolean {
    const requirements = new Set(action.requires ?? []);
    return (definition.dependencies ?? []).some(
        (dependency) =>
            requirements.has(dependency.name) && integrationInstallationId(dependency.kind) === changedInstallationId,
    );
}

async function executeAction(
    deps: IntegrationImportDeps,
    definition: IntegrationDefinition,
    installation: IntegrationInstallation,
    dependencies: NonNullable<TemplateContext["dependencies"]>,
    action: DeclarativeAfterInstallationTemplate,
): Promise<void> {
    const resolved = await resolveIntegrationInputs(
        definition,
        installation.answersSnapshot,
        deps.resolvePublishedPage,
    );
    const context: TemplateContext = {
        answers: installation.answersSnapshot,
        resolved,
        dependencies,
        secrets: Object.fromEntries(
            Object.entries(installation.secretRefs).map(([name, key]) => [name, secretKeyToRef(key)]),
        ),
        secretInputs: new Set(installation.secretInputs),
    };
    const fn: CmsFunction = {
        id: `afterInstallation-${action.id}`,
        method: "POST",
        access: { mode: "system" },
        steps: resolveTemplates(action.steps, context),
        return: { status: 204 },
    };
    const errors = await validateFunction(fn, { sources: deps.sources });
    if (errors.length) {
        throw new IntegrationInputError(`afterInstallation.${installation.id}.${action.id}`, errors.join("; "));
    }
    const response = await executeFunction(
        fn,
        new Request("https://cms.internal/integration/after-installation", {
            method: "POST",
        }),
        {
            sources: deps.sources,
            deps: deps.sourceExecutorDeps,
            identities: deps.sourceExecutorDeps?.identities,
            user: {},
        },
    );
    if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 1_000);
        throw new IntegrationRuntimeError(
            `afterInstallation "${installation.id}.${action.id}" failed (${response.status})${detail ? `: ${detail}` : ""}`,
            response.status,
        );
    }
}
