import { IntegrationRuntimeError } from "../../errors";
import type {
    IntegrationInstallation,
    IntegrationMigrationJournalEntry,
} from "../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../interfaces/IntegrationInstallationRepository";
import type {
    IntegrationMigrationConnectorTransition,
    IntegrationMigrationPhase,
} from "../../../interfaces/IntegrationConnectorDeployer";
import type { DurableMigrationUpgradeRequest } from "./engine";
import { requiredMigrationOperation, saveMigrationJournalEntry } from "./shared";
import { assertFence, type MigrationClock } from "./state";
import { withMigrationLeaseHeartbeat } from "./runtime/leaseHeartbeat";

export async function runMigrationPhases(
    request: DurableMigrationUpgradeRequest,
    initial: IntegrationInstallation,
    connectors: IntegrationMigrationConnectorTransition[],
    phases: IntegrationMigrationPhase[],
    clock: MigrationClock,
    leaseMs: number,
): Promise<IntegrationInstallation> {
    let installation = initial;
    for (const phase of phases) {
        installation = await runPhase(request, installation, connectors, phase, clock, leaseMs);
    }
    return installation;
}

async function runPhase(
    request: DurableMigrationUpgradeRequest,
    initial: IntegrationInstallation,
    connectors: IntegrationMigrationConnectorTransition[],
    phase: IntegrationMigrationPhase,
    clock: MigrationClock,
    leaseMs: number,
): Promise<IntegrationInstallation> {
    let installation = initial;
    let operation = requiredMigrationOperation(installation);
    const currentEntry = operation.journal.find((entry) => entry.phase === phase);
    if (!currentEntry) {
        throw new IntegrationRuntimeError(`integration migration journal is missing phase "${phase}"`);
    }
    if (currentEntry.status === "succeeded") {
        return installation;
    }
    const runningEntry: IntegrationMigrationJournalEntry = {
        ...currentEntry,
        status: "running",
        attemptId: operation.attemptId,
        startedAt: currentEntry.startedAt ?? clock.now(),
        error: undefined,
    };
    installation = await saveMigrationJournalEntry(request.installations, installation, runningEntry, clock, leaseMs);
    operation = requiredMigrationOperation(installation);
    const context = {
        phase,
        idempotencyKey: runningEntry.idempotencyKey,
        targetDigest: runningEntry.targetDigest,
        operation,
        installation,
        sourceDefinition: operation.sourceDefinition,
        targetDefinition: operation.targetDefinition,
        targetPackageRoot: request.resolvedPackage.root,
        connectors,
    };
    const remote = await withMigrationLeaseHeartbeat({
        repository: request.installations,
        installation,
        clock,
        leaseMs,
        operation: async () => {
            let outcome =
                currentEntry.status === "running" || currentEntry.status === "failed"
                    ? await request.runtime.confirmStep(context, currentEntry)
                    : { confirmed: false as const };
            let importResult = outcome.importResult ?? currentEntry.importResult;
            if (!outcome.confirmed) {
                const executed = await request.runtime.executeStep(context);
                importResult = executed.importResult;
                outcome = await request.runtime.confirmStep(context, executed);
                importResult = outcome.importResult ?? importResult;
                assertExecutionConfirmed(phase, runningEntry.targetDigest, executed.confirmationDigest, outcome);
                outcome = {
                    ...outcome,
                    externalOperationId: outcome.externalOperationId ?? executed.externalOperationId,
                    confirmationDigest: outcome.confirmationDigest ?? executed.confirmationDigest,
                };
            }
            return { outcome, importResult };
        },
    });
    installation = remote.installation;
    operation = requiredMigrationOperation(installation);
    const { outcome, importResult } = remote.value;
    if (outcome.confirmationDigest !== runningEntry.targetDigest) {
        throw new IntegrationRuntimeError(`migration phase "${phase}" confirmation digest does not match its target`);
    }
    installation = await requireCurrentFence(request.installations, installation, operation, clock);
    return await saveMigrationJournalEntry(
        request.installations,
        installation,
        {
            ...runningEntry,
            status: "succeeded",
            externalOperationId: outcome.externalOperationId,
            confirmationDigest: outcome.confirmationDigest,
            ...(importResult ? { importResult } : {}),
            confirmedAt: clock.now(),
        },
        clock,
        leaseMs,
    );
}

async function requireCurrentFence(
    repository: IntegrationInstallationRepository,
    installation: IntegrationInstallation,
    operation: NonNullable<IntegrationInstallation["migrationOperation"]>,
    clock: MigrationClock,
): Promise<IntegrationInstallation> {
    const current = await repository.get(installation.id);
    if (!current) {
        throw new IntegrationRuntimeError("integration disappeared during migration");
    }
    assertFence(current, operation, clock.now());
    return current;
}

function assertExecutionConfirmed(
    phase: IntegrationMigrationPhase,
    targetDigest: string,
    executedDigest: string,
    outcome: { confirmed: boolean },
): void {
    if (!outcome.confirmed) {
        throw new IntegrationRuntimeError(`migration phase "${phase}" could not be confirmed after execution`);
    }
    if (executedDigest !== targetDigest) {
        throw new IntegrationRuntimeError(`migration phase "${phase}" returned an unexpected target digest`);
    }
}
