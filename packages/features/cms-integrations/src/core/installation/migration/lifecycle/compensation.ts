import { IntegrationRuntimeError } from "../../../errors";
import type {
    IntegrationInstallation,
    IntegrationMigrationJournalEntry,
} from "../../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../../interfaces/IntegrationInstallationRepository";
import type {
    IntegrationMigrationPhase,
    IntegrationMigrationRuntime,
} from "../../../../interfaces/IntegrationConnectorDeployer";
import { withMigrationLeaseHeartbeat } from "../runtime/leaseHeartbeat";
import { requiredMigrationOperation, saveMigrationJournalEntry } from "../shared";
import type { MigrationClock } from "../state";

export async function compensateMigrationPhase(
    repository: IntegrationInstallationRepository,
    initial: IntegrationInstallation,
    runtime: IntegrationMigrationRuntime,
    targetPackageRoot: string,
    phase: IntegrationMigrationPhase,
    clock: MigrationClock,
    leaseMs: number,
): Promise<IntegrationInstallation> {
    let installation = initial;
    let operation = requiredMigrationOperation(installation);
    const entry = operation.journal.find((candidate) => candidate.phase === phase);
    if (entry?.status !== "succeeded" || entry.compensation?.status === "succeeded") {
        return installation;
    }
    const running: IntegrationMigrationJournalEntry = {
        ...entry,
        compensation: {
            status: "running",
            attemptId: operation.attemptId,
            startedAt: entry.compensation?.startedAt ?? clock.now(),
        },
    };
    installation = await saveMigrationJournalEntry(repository, installation, running, clock, leaseMs);
    operation = requiredMigrationOperation(installation);
    if (!runtime.compensateStep) {
        throw new IntegrationRuntimeError(`migration runtime cannot compensate phase "${phase}"`, 409);
    }
    const context = {
        phase,
        idempotencyKey: entry.idempotencyKey,
        targetDigest: entry.targetDigest,
        operation,
        installation,
        sourceDefinition: operation.sourceDefinition,
        targetDefinition: operation.targetDefinition,
        targetPackageRoot,
        connectors: operation.connectors,
    };
    const remote = await withMigrationLeaseHeartbeat({
        repository,
        installation,
        clock,
        leaseMs,
        operation: async () =>
            await runtime.compensateStep!(context, {
                ...(entry.externalOperationId ? { externalOperationId: entry.externalOperationId } : {}),
                ...(entry.confirmationDigest ? { confirmationDigest: entry.confirmationDigest } : {}),
            }),
    });
    if (!remote.value.compensated) {
        throw new IntegrationRuntimeError(`migration phase "${phase}" compensation was not confirmed`, 409);
    }
    return await saveMigrationJournalEntry(
        repository,
        remote.installation,
        {
            ...running,
            compensation: {
                ...running.compensation!,
                status: "succeeded",
                ...(remote.value.externalOperationId ? { externalOperationId: remote.value.externalOperationId } : {}),
                confirmedAt: clock.now(),
            },
        },
        clock,
        leaseMs,
    );
}
