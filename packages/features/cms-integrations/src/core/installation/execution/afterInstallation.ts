import { executeFunction, validateFunction, type CmsFunction } from "@bernouy/cms-functions";
import { secretKeyToRef } from "@bernouy/cms-secrets";
import { IntegrationInputError, IntegrationRuntimeError } from "../../errors";
import { resolveDependencyContext } from "../../import/dependencies";
import { resolveIntegrationInputs } from "../../definitions/resolvedInputs";
import { resolveTemplates, type TemplateContext } from "../../definitions/templating/templates";
import type { DeclarativeAfterInstallationTemplate, IntegrationDefinition } from "../../../interfaces/Integration";
import type { IntegrationImportDeps } from "../../../interfaces/IntegrationImport";
import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../interfaces/IntegrationInstallationRepository";
import { integrationInstallationId } from "../ids";
import { isMigrationOwner, type MigrationOwner } from "../migration/state";
import { markAfterInstallationFailed } from "./afterInstallationFailure";

type ChangedInstallationReconcileOptions = {
    migrationOwner?: MigrationOwner;
    pendingOwner?: { id: string; updatedAt: Date };
    now?: () => Date;
    markFailure?: boolean;
    validateOnly?: boolean;
};

export async function reconcileChangedInstallation(
    deps: IntegrationImportDeps,
    installations: IntegrationInstallationRepository,
    changedInstallationId: string,
    options: ChangedInstallationReconcileOptions = {},
): Promise<void> {
    await reconcileAfterInstallation(deps, installations, changedInstallationId, "changed", options);
}

export async function validateChangedInstallation(
    deps: IntegrationImportDeps,
    installations: IntegrationInstallationRepository,
    changedInstallationId: string,
    options: Omit<ChangedInstallationReconcileOptions, "validateOnly" | "markFailure"> = {},
): Promise<void> {
    await reconcileAfterInstallation(deps, installations, changedInstallationId, "changed", {
        ...options,
        markFailure: false,
        validateOnly: true,
    });
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
    options: ChangedInstallationReconcileOptions = {},
): Promise<void> {
    const installed = await installations.list();
    for (const installation of installed) {
        const definition = installation.definitionSnapshot;
        const migration = installation.migrationOperation;
        const pendingOwner = options.pendingOwner;
        const activeMigration =
            migration !== undefined &&
            scope === "changed" &&
            installation.id === changedInstallationId &&
            options.migrationOwner !== undefined &&
            isMigrationOwner(migration, options.migrationOwner) &&
            migration.leaseExpiresAt.getTime() > (options.now?.() ?? new Date()).getTime() &&
            migration.status !== "completed" &&
            migration.status !== "aborted";
        const claimedPending =
            installation.status === "pending" &&
            scope === "changed" &&
            installation.id === changedInstallationId &&
            pendingOwner !== undefined &&
            pendingOwner.id === installation.pendingOperation?.id &&
            pendingOwner.updatedAt.getTime() === installation.updatedAt.getTime() &&
            (!migration || migration.status === "completed" || migration.status === "aborted");
        if (
            (installation.status !== "success" && !activeMigration && !claimedPending) ||
            !definition?.afterInstallation?.length
        ) {
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
                const current = options.migrationOwner
                    ? await requireMigrationOwner(installations, installation.id, {
                          ...options,
                          migrationOwner: options.migrationOwner,
                      })
                    : options.pendingOwner
                      ? await requirePendingOwner(installations, installation.id, options.pendingOwner)
                      : installation;
                const fn = await buildAction(deps, definition, current, dependencies, action);
                if (!options.validateOnly) {
                    await executeAction(deps, current, action, fn);
                }
            } catch (error) {
                if (options.markFailure !== false) {
                    await markAfterInstallationFailed(installations, installation.id, error);
                }
                throw error;
            }
        }
    }
}

async function requirePendingOwner(
    installations: IntegrationInstallationRepository,
    installationId: string,
    expected: { id: string; updatedAt: Date },
): Promise<IntegrationInstallation> {
    const current = await installations.get(installationId);
    if (
        !current ||
        current.status !== "pending" ||
        current.pendingOperation?.id !== expected.id ||
        current.updatedAt.getTime() !== expected.updatedAt.getTime() ||
        current.migrationOperation?.status === "running" ||
        current.migrationOperation?.status === "paused" ||
        current.migrationOperation?.status === "activated"
    ) {
        throw new IntegrationRuntimeError("integration installation operation was fenced", 409);
    }
    return current;
}

async function requireMigrationOwner(
    installations: IntegrationInstallationRepository,
    installationId: string,
    options: ChangedInstallationReconcileOptions & { migrationOwner: MigrationOwner },
): Promise<IntegrationInstallation> {
    const current = await installations.get(installationId);
    const operation = current?.migrationOperation;
    if (
        !current ||
        !isMigrationOwner(operation, options.migrationOwner) ||
        operation.leaseExpiresAt.getTime() <= (options.now?.() ?? new Date()).getTime()
    ) {
        throw new IntegrationRuntimeError("integration migration attempt was fenced", 409);
    }
    return current;
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

async function buildAction(
    deps: IntegrationImportDeps,
    definition: IntegrationDefinition,
    installation: IntegrationInstallation,
    dependencies: NonNullable<TemplateContext["dependencies"]>,
    action: DeclarativeAfterInstallationTemplate,
): Promise<CmsFunction> {
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
    return fn;
}

async function executeAction(
    deps: IntegrationImportDeps,
    installation: IntegrationInstallation,
    action: DeclarativeAfterInstallationTemplate,
    fn: CmsFunction,
): Promise<void> {
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
