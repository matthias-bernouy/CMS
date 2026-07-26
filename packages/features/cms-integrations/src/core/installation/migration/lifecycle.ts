import { IntegrationInputError, IntegrationRuntimeError } from "../../errors";
import { appendRun, successRun } from "../execution/runs";
import { sanitizeDefinitionSnapshot } from "../snapshots";
import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../interfaces/IntegrationInstallationRepository";
import type { IntegrationMigrationConnectorTransition } from "../../../interfaces/IntegrationConnectorDeployer";
import type { RunIntegrationInstallationResult } from "../execution/runIntegrationInstallation";
import type { DurableMigrationUpgradeRequest } from "./engine";
import {
    mergedMigrationImportResult,
    migrationActivationRevision,
    requiredMigrationJournalEntry,
    requiredMigrationOperation,
} from "./shared";
import { type MigrationClock, systemMigrationClock, updateMigrationInstallation } from "./state";

export async function activateMigrationTarget(
    request: DurableMigrationUpgradeRequest,
    installation: IntegrationInstallation,
    connectors: IntegrationMigrationConnectorTransition[],
    clock: MigrationClock,
    leaseMs: number,
): Promise<IntegrationInstallation> {
    const operation = requiredMigrationOperation(installation);
    const importResult = mergedMigrationImportResult(operation.journal);
    const bindings = { ...(installation.connectorBindings ?? {}) };
    for (const connector of connectors) {
        const connectorResult = importResult.connectors?.find((entry) => entry.connectorKey === connector.connectorKey);
        bindings[connector.connectorKey] = {
            connectorKey: connector.connectorKey,
            provider: connector.provider,
            lineageId: connector.lineageId,
            connectorInstanceId: connector.connectorInstanceId,
            migrationRevision: migrationActivationRevision(connector),
            outputs: {
                ...(bindings[connector.connectorKey]?.outputs ?? {}),
                ...(connectorResult?.outputs ?? {}),
            },
        };
    }
    return await updateMigrationInstallation({
        repository: request.installations,
        installation,
        operation: { ...operation, status: "activated", activatedAt: clock.now() },
        clock,
        leaseMs,
        patch: {
            definitionVersion: operation.targetVersion,
            definitionSnapshot: sanitizeDefinitionSnapshot(operation.targetDefinition),
            packageDigest: operation.targetPackageDigest,
            connectorBindings: bindings,
            ...(importResult.artifacts.length
                ? { artifacts: mergeMigrationArtifacts(installation.artifacts, importResult.artifacts) }
                : {}),
        },
    });
}

export async function markMigrationPointOfNoReturn(
    repository: IntegrationInstallationRepository,
    installation: IntegrationInstallation,
    clock: MigrationClock,
    leaseMs: number,
): Promise<IntegrationInstallation> {
    const operation = requiredMigrationOperation(installation);
    if (requiredMigrationJournalEntry(operation.journal, "point-of-no-return").status !== "succeeded") {
        throw new IntegrationRuntimeError("point-of-no-return prerequisites were not confirmed");
    }
    return await updateMigrationInstallation({
        repository,
        installation,
        operation: { ...operation, pointOfNoReturnReachedAt: clock.now() },
        clock,
        leaseMs,
    });
}

export async function completeIntegrationMigration(
    repository: IntegrationInstallationRepository,
    installation: IntegrationInstallation,
    clock: MigrationClock,
    leaseMs: number,
): Promise<RunIntegrationInstallationResult> {
    const operation = requiredMigrationOperation(installation);
    const importResult = mergedMigrationImportResult(operation.journal);
    const run = successRun(installation.runCount + 1, operation.startedAt, importResult);
    const bindings = structuredClone(installation.connectorBindings ?? {});
    for (const binding of Object.values(bindings)) {
        const target = operation.targetDefinition.connectors?.find(
            (connector) => connector.connectorKey === binding.connectorKey,
        );
        if (target?.migrationRevision !== undefined) {
            binding.migrationRevision = target.migrationRevision;
        }
    }
    const completed = await updateMigrationInstallation({
        repository,
        installation,
        operation: { ...operation, status: "completed" },
        clock,
        leaseMs,
        patch: appendRun(installation, run, {
            status: "success",
            connectorBindings: bindings,
            ...(importResult.artifacts.length
                ? { artifacts: mergeMigrationArtifacts(installation.artifacts, importResult.artifacts) }
                : {}),
        }),
    });
    return { ...importResult, installation: completed, run };
}

function mergeMigrationArtifacts(
    existing: IntegrationInstallation["artifacts"],
    migrated: IntegrationInstallation["artifacts"],
): IntegrationInstallation["artifacts"] {
    const byIdentity = new Map(existing.map((artifact) => [`${artifact.type}:${artifact.id}`, artifact]));
    for (const artifact of migrated) {
        byIdentity.set(`${artifact.type}:${artifact.id}`, artifact);
    }
    return [...byIdentity.values()];
}

export async function pauseIntegrationMigration(
    repository: IntegrationInstallationRepository,
    installation: IntegrationInstallation,
    clock: MigrationClock,
    leaseMs: number,
    error: unknown,
): Promise<void> {
    const current = await repository.get(installation.id);
    const operation = current?.migrationOperation;
    if (!current || !operation || operation.leaseExpiresAt.getTime() <= clock.now().getTime()) {
        return;
    }
    try {
        const message = error instanceof Error ? error.message : "integration migration failed";
        await updateMigrationInstallation({
            repository,
            installation: current,
            operation: {
                ...operation,
                status: "paused",
                journal: operation.journal.map((entry) =>
                    entry.status === "running" ? { ...entry, status: "failed", error: { message } } : entry,
                ),
            },
            clock,
            leaseMs,
            patch: { status: "failed" },
        });
    } catch {
        // A takeover may have fenced this attempt; it must not overwrite the new owner.
    }
}

export async function abortIntegrationMigration(input: {
    installations: IntegrationInstallationRepository;
    integrationId: string;
    reason: string;
    clock?: MigrationClock;
}): Promise<IntegrationInstallation> {
    const installation = await input.installations.get(input.integrationId);
    const operation = installation?.migrationOperation;
    if (!installation || !operation) {
        throw new IntegrationInputError("integrationId", "integration has no migration to abort");
    }
    if (operation.activatedAt || operation.pointOfNoReturnReachedAt) {
        throw new IntegrationRuntimeError("activated migration cannot be aborted automatically", 409);
    }
    const clock = input.clock ?? systemMigrationClock;
    const now = clock.now();
    const expected =
        operation.status === "running" ? operation : { ...operation, leaseExpiresAt: new Date(now.getTime() + 1) };
    return await updateMigrationInstallation({
        repository: input.installations,
        installation: { ...installation, migrationOperation: expected },
        operation: {
            ...expected,
            status: "aborted",
            journal: expected.journal.map((entry) =>
                entry.status === "succeeded" ? entry : { ...entry, status: "failed", error: { message: input.reason } },
            ),
        },
        clock,
        leaseMs: 1,
        patch: { status: "failed" },
    });
}
