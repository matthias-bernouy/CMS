import type { IntegrationInstallation } from "../../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../../interfaces/IntegrationInstallationRepository";
import { requiredMigrationOperation } from "../shared";
import { isMigrationOwner, type MigrationClock, migrationOwner, updateMigrationInstallation } from "../state";

export async function persistAbortIntent(
    repository: IntegrationInstallationRepository,
    installation: IntegrationInstallation,
    actor: string,
    reason: string,
    clock: MigrationClock,
    leaseMs: number,
): Promise<IntegrationInstallation> {
    const operation = requiredMigrationOperation(installation);
    return await updateMigrationInstallation({
        repository,
        installation,
        operation: {
            ...operation,
            abortRequestedAt: operation.abortRequestedAt ?? clock.now(),
            abortRequestedBy: operation.abortRequestedBy ?? actor,
            abortReason: operation.abortReason ?? reason,
        },
        clock,
        leaseMs,
    });
}

export async function finishAbort(
    repository: IntegrationInstallationRepository,
    installation: IntegrationInstallation,
    clock: MigrationClock,
    leaseMs: number,
): Promise<IntegrationInstallation> {
    const operation = requiredMigrationOperation(installation);
    const rollbackPatch = operation.activatedAt
        ? {
              definitionVersion: operation.currentVersion,
              definitionSnapshot: structuredClone(operation.sourceDefinition),
              packageDigest: operation.currentPackageDigest,
              connectorBindings: structuredClone(operation.sourceState!.connectorBindings),
              artifacts: structuredClone(operation.sourceState!.artifacts),
          }
        : {};
    return await updateMigrationInstallation({
        repository,
        installation,
        operation: {
            ...operation,
            status: "aborted",
            abortedAt: clock.now(),
            journal: operation.journal.map((entry) =>
                entry.status === "succeeded"
                    ? entry
                    : { ...entry, status: "failed", error: { message: operation.abortReason ?? "migration aborted" } },
            ),
        },
        clock,
        leaseMs,
        patch: { status: "success", ...rollbackPatch },
    });
}

export async function pauseAbortCompensation(
    repository: IntegrationInstallationRepository,
    expectedInstallation: IntegrationInstallation,
    clock: MigrationClock,
    leaseMs: number,
    error: unknown,
): Promise<void> {
    const expectedOperation = expectedInstallation.migrationOperation;
    if (!expectedOperation) {
        return;
    }
    const owner = migrationOwner(expectedOperation);
    const installation = await repository.get(expectedInstallation.id);
    const operation = installation?.migrationOperation;
    if (
        !installation ||
        !isMigrationOwner(operation, owner) ||
        operation.leaseExpiresAt.getTime() <= clock.now().getTime()
    ) {
        return;
    }
    try {
        const message = error instanceof Error ? error.message : "migration compensation failed";
        await updateMigrationInstallation({
            repository,
            installation,
            operation: {
                ...operation,
                status: "paused",
                journal: operation.journal.map((entry) =>
                    entry.compensation?.status === "running"
                        ? {
                              ...entry,
                              compensation: { ...entry.compensation, status: "failed", error: { message } },
                          }
                        : entry,
                ),
            },
            clock,
            leaseMs,
            patch: { status: "failed" },
        });
    } catch {
        // A takeover fenced this abort attempt; it must not overwrite the new owner.
    }
}
