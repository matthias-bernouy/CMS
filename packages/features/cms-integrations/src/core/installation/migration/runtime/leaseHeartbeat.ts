import { IntegrationRuntimeError } from "../../../errors";
import type { IntegrationInstallation } from "../../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../../interfaces/IntegrationInstallationRepository";
import { requiredMigrationOperation } from "../shared";
import { type MigrationClock, updateMigrationInstallation } from "../state";

export async function withMigrationLeaseHeartbeat<T>(input: {
    repository: IntegrationInstallationRepository;
    installation: IntegrationInstallation;
    clock: MigrationClock;
    leaseMs: number;
    operation: () => Promise<T>;
}): Promise<{ value: T; installation: IntegrationInstallation }> {
    let latest = input.installation;
    let heartbeatFailure: unknown;
    let heartbeat: Promise<void> | undefined;
    const intervalMs = Math.max(100, Math.floor(input.leaseMs / 3));
    const timer = setInterval(() => {
        if (heartbeat || heartbeatFailure) {
            return;
        }
        heartbeat = renewLease(input.repository, latest, input.clock, input.leaseMs)
            .then((installation) => {
                latest = installation;
            })
            .catch((error) => {
                heartbeatFailure = error;
            })
            .finally(() => {
                heartbeat = undefined;
            });
    }, intervalMs);

    try {
        const value = await input.operation();
        if (heartbeat) {
            await heartbeat;
        }
        if (heartbeatFailure) {
            throw new IntegrationRuntimeError("integration migration lease heartbeat failed", 409);
        }
        return { value, installation: latest };
    } finally {
        clearInterval(timer);
        if (heartbeat) {
            await heartbeat.catch(() => undefined);
        }
    }
}

async function renewLease(
    repository: IntegrationInstallationRepository,
    installation: IntegrationInstallation,
    clock: MigrationClock,
    leaseMs: number,
): Promise<IntegrationInstallation> {
    return await updateMigrationInstallation({
        repository,
        installation,
        operation: requiredMigrationOperation(installation),
        clock,
        leaseMs,
    });
}
