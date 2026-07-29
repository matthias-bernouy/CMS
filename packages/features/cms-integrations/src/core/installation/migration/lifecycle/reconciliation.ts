import { secretKeyToRef } from "@bernouy/cms-secrets";
import type { DependencyTemplateContext, TemplateContext } from "../../../definitions/templating/templates";
import { IntegrationInputError, IntegrationRuntimeError } from "../../../errors";
import { resolveIntegrationInputs } from "../../../definitions/resolvedInputs";
import { connectorOutputsWithProviderAliases } from "../../../import/connectorDeployments";
import { resolveDependencyContext } from "../../../import/dependencies";
import {
    executeDeclarativeArtifactWrites,
    prepareDeclarativeArtifactWrites,
} from "../../../import/declarative/artifactExecution";
import { buildSourceArtifacts } from "../../../import/declarative/builders/artifactBuilders";
import { projectTargetSources } from "../../../import/declarative/projectedSourceRepository";
import { withObsoleteArtifactCleanup } from "../../artifactCleanup";
import { validateChangedInstallation } from "../../execution/afterInstallation";
import type { IntegrationDefinition } from "../../../../interfaces/Integration";
import type {
    IntegrationArtifactResult,
    IntegrationImportDeps,
    IntegrationImportResult,
} from "../../../../interfaces/IntegrationImport";
import type {
    IntegrationInstallation,
    IntegrationMigrationJournalEntry,
} from "../../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../../interfaces/IntegrationInstallationRepository";
import { cmsSourceDigest } from "../runtime/bindingTarget";
import { type MigrationLeaseController, withMigrationLeaseHeartbeat } from "../runtime/leaseHeartbeat";
import { requiredMigrationJournalEntry, requiredMigrationOperation, saveMigrationJournalEntry } from "../shared";
import { assertMigrationOwner, migrationOwner } from "../state";
import { type MigrationClock, updateMigrationInstallation } from "../state";

const RECONCILIATION_PHASE = "reconcile-declarative" as const;

type MigrationTargetReconciliationRequest = {
    deps?: IntegrationImportDeps;
    installations: IntegrationInstallationRepository;
    installation: IntegrationInstallation;
    clock: MigrationClock;
    leaseMs: number;
};

type PreparedTargetReconciliation = {
    definition: IntegrationDefinition;
    context: TemplateContext;
    confirmedSourceResults: IntegrationArtifactResult[];
};

export async function validateMigrationTargetReconciliation(
    request: MigrationTargetReconciliationRequest,
): Promise<void> {
    if (!request.deps) {
        return;
    }
    const owner = migrationOwner(requiredMigrationOperation(request.installation));
    const prepared = await prepareTargetReconciliation({ ...request, deps: request.deps }, request.installation, owner);
    const removedSourceIds = removedOwnedSourceIds(request.installation, prepared.definition, prepared.context);
    await prepareDeclarativeArtifactWrites({
        deps: request.deps,
        definition: prepared.definition,
        context: prepared.context,
        options: { force: true },
        baseResult: {},
        confirmedSourceResults: prepared.confirmedSourceResults,
        hiddenSourceIds: removedSourceIds,
    });
    const validationDeps = {
        ...request.deps,
        sources: projectTargetSources(
            request.deps.sources,
            buildSourceArtifacts(prepared.definition, prepared.context),
            removedSourceIds,
        ),
    };
    await validateChangedInstallation(validationDeps, request.installations, request.installation.id, {
        migrationOwner: owner,
        now: () => request.clock.now(),
    });
}

export async function validateMigrationTargetHooks(
    definition: IntegrationDefinition,
    installations: IntegrationInstallationRepository,
): Promise<void> {
    assertNoDeferredMigrationHooks(definition, await resolveDependencyContext(definition, installations));
}

function assertNoDeferredMigrationHooks(
    definition: IntegrationDefinition,
    dependencies: DependencyTemplateContext,
): void {
    const deferred = (definition.afterInstallation ?? []).filter((action) =>
        (action.requires ?? []).some((name) => !dependencies[name]),
    );
    if (deferred.length) {
        throw new IntegrationInputError(
            "afterInstallation",
            `cannot prove deferred migration hooks safe against the target artifacts: ${deferred.map((action) => action.id).join(", ")}`,
        );
    }
}

export async function runMigrationTargetReconciliation(
    request: MigrationTargetReconciliationRequest,
): Promise<IntegrationInstallation> {
    const operation = requiredMigrationOperation(request.installation);
    const entry = requiredMigrationJournalEntry(operation.journal, RECONCILIATION_PHASE);
    if (entry.status === "succeeded") {
        return request.installation;
    }
    if (
        request.deps &&
        entry.attemptId &&
        entry.attemptId !== operation.attemptId &&
        (entry.status === "running" || entry.status === "failed")
    ) {
        throw new IntegrationRuntimeError(
            "declarative migration reconciliation outcome is ambiguous; operator recovery is required",
            409,
        );
    }
    const running: IntegrationMigrationJournalEntry = {
        ...entry,
        status: "running",
        attemptId: operation.attemptId,
        startedAt: entry.startedAt ?? request.clock.now(),
        error: undefined,
    };
    const installation = await saveMigrationJournalEntry(
        request.installations,
        request.installation,
        running,
        request.clock,
        request.leaseMs,
    );
    if (!request.deps) {
        return await saveReconciliationReceipt(request, installation, running, { artifacts: [] });
    }
    const deps = request.deps;
    const owner = migrationOwner(requiredMigrationOperation(installation));
    const reconciled = await withMigrationLeaseHeartbeat({
        repository: request.installations,
        installation,
        clock: request.clock,
        leaseMs: request.leaseMs,
        operation: async (lease) => await reconcileTarget({ ...request, deps }, lease, running, owner),
    });
    return reconciled.installation;
}

async function reconcileTarget(
    request: MigrationTargetReconciliationRequest & { deps: IntegrationImportDeps },
    lease: MigrationLeaseController,
    running: IntegrationMigrationJournalEntry,
    owner: ReturnType<typeof migrationOwner>,
): Promise<void> {
    const installation = lease.current();
    const prepared = await prepareTargetReconciliation(request, installation, owner);
    const confirmedSourceIds = new Set(prepared.confirmedSourceResults.map((artifact) => artifact.id));
    await executeDeclarativeArtifactWrites({
        deps: request.deps,
        definition: prepared.definition,
        context: prepared.context,
        options: { force: true },
        baseResult: {},
        confirmedSourceResults: prepared.confirmedSourceResults,
        hiddenSourceIds: removedOwnedSourceIds(installation, prepared.definition, prepared.context),
        commit: async (importResult) =>
            await withObsoleteArtifactCleanup({
                deps: request.deps,
                installations: request.installations,
                installationId: installation.id,
                previousArtifacts: installation.artifacts,
                nextArtifacts: importResult.artifacts,
                operation: async () => {
                    return await lease.update(
                        async (current) =>
                            await persistReconciliation(
                                request,
                                current,
                                running,
                                importResult,
                                owner,
                                confirmedSourceIds,
                            ),
                    );
                },
            }),
    });
}

function removedOwnedSourceIds(
    installation: IntegrationInstallation,
    definition: IntegrationDefinition,
    context: TemplateContext,
): ReadonlySet<string> {
    const targetIds = new Set(buildSourceArtifacts(definition, context).map((source) => source.urn));
    return new Set(
        installation.artifacts
            .filter((artifact) => artifact.type === "source" && !targetIds.has(artifact.id))
            .map((artifact) => artifact.id),
    );
}

async function prepareTargetReconciliation(
    request: MigrationTargetReconciliationRequest & { deps: IntegrationImportDeps },
    installation: IntegrationInstallation,
    owner: ReturnType<typeof migrationOwner>,
): Promise<PreparedTargetReconciliation> {
    const operation = requiredMigrationOperation(installation);
    assertMigrationOwner(operation, owner);
    const definition = operation.targetDefinition;
    const dependencies = await resolveDependencyContext(definition, request.installations);
    const resolved = await resolveIntegrationInputs(
        definition,
        installation.answersSnapshot,
        request.deps.resolvePublishedPage,
    );
    const context = {
        answers: installation.answersSnapshot,
        resolved,
        dependencies,
        secrets: Object.fromEntries(
            Object.entries(installation.secretRefs).map(([name, key]) => [name, secretKeyToRef(key)]),
        ),
        secretInputs: new Set(installation.secretInputs),
        connectors: connectorOutputsWithProviderAliases(
            definition.connectors ?? [],
            Object.fromEntries(
                Object.entries(installation.connectorBindings ?? {}).map(([key, binding]) => [key, binding.outputs]),
            ),
        ),
    };
    assertNoDeferredMigrationHooks(definition, dependencies);
    const confirmedSourceResults = await confirmedTargetSources(request.deps, operation.journal, definition, context);
    return { definition, context, confirmedSourceResults };
}

async function confirmedTargetSources(
    deps: IntegrationImportDeps,
    journal: IntegrationMigrationJournalEntry[],
    definition: IntegrationDefinition,
    context: Parameters<typeof buildSourceArtifacts>[1],
): Promise<IntegrationArtifactResult[]> {
    const receipt = requiredMigrationJournalEntry(journal, "switch-cms-binding");
    const confirmed = (receipt.importResult?.artifacts ?? []).filter((artifact) => artifact.type === "source");
    const targets = new Map(buildSourceArtifacts(definition, context).map((source) => [source.urn, source]));
    for (const artifact of confirmed) {
        const target = targets.get(artifact.id);
        const current = await deps.sources.getSource(artifact.id);
        if (!target || !current || (await cmsSourceDigest(current)) !== (await cmsSourceDigest(target))) {
            throw new IntegrationRuntimeError(`confirmed migration Source "${artifact.id}" no longer matches target`);
        }
    }
    return confirmed;
}

async function persistReconciliation(
    request: Pick<MigrationTargetReconciliationRequest, "installations" | "clock" | "leaseMs">,
    installation: IntegrationInstallation,
    running: IntegrationMigrationJournalEntry,
    importResult: IntegrationImportResult,
    owner: ReturnType<typeof migrationOwner>,
    confirmedSourceIds: ReadonlySet<string> = new Set(),
): Promise<IntegrationInstallation> {
    const operation = requiredMigrationOperation(installation);
    assertMigrationOwner(operation, owner);
    const receipt = {
        ...running,
        status: "succeeded" as const,
        externalOperationId: `cms:${running.idempotencyKey}`,
        confirmationDigest: running.targetDigest,
        importResult: {
            ...importResult,
            artifacts: importResult.artifacts.filter(
                (artifact) => artifact.type !== "source" || !confirmedSourceIds.has(artifact.id),
            ),
        },
        confirmedAt: request.clock.now(),
    };
    return await updateMigrationInstallation({
        repository: request.installations,
        installation,
        operation: {
            ...operation,
            journal: operation.journal.map((entry) => (entry.id === receipt.id ? receipt : entry)),
        },
        clock: request.clock,
        leaseMs: request.leaseMs,
        patch: { artifacts: importResult.artifacts },
    });
}

async function saveReconciliationReceipt(
    request: Pick<MigrationTargetReconciliationRequest, "installations" | "clock" | "leaseMs">,
    installation: IntegrationInstallation,
    running: IntegrationMigrationJournalEntry,
    importResult: IntegrationImportResult,
): Promise<IntegrationInstallation> {
    return await persistReconciliation(
        request,
        installation,
        running,
        importResult,
        migrationOwner(requiredMigrationOperation(installation)),
    );
}
