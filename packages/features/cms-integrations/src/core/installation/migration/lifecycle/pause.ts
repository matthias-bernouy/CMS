import type { IntegrationInstallation } from "../../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../../interfaces/IntegrationInstallationRepository";
import { isMigrationOwner, type MigrationClock, migrationOwner, updateMigrationInstallation } from "../state";

export async function pauseIntegrationMigration(
    repository: IntegrationInstallationRepository,
    installation: IntegrationInstallation,
    clock: MigrationClock,
    leaseMs: number,
    error: unknown,
): Promise<void> {
    const expected = installation.migrationOperation;
    if (!expected) {
        return;
    }
    const owner = migrationOwner(expected);
    const current = await repository.get(installation.id);
    const operation = current?.migrationOperation;
    if (
        !current ||
        !isMigrationOwner(operation, owner) ||
        operation.leaseExpiresAt.getTime() <= clock.now().getTime()
    ) {
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
