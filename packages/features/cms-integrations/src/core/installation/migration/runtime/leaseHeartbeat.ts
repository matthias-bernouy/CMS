import { IntegrationRuntimeError } from "../../../errors";
import type { IntegrationInstallation } from "../../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../../interfaces/IntegrationInstallationRepository";
import { requiredMigrationOperation } from "../shared";
import { type MigrationClock, updateMigrationInstallation } from "../state";

export type MigrationLeaseController = {
    current(): IntegrationInstallation;
    update(
        operation: (installation: IntegrationInstallation) => Promise<IntegrationInstallation>,
    ): Promise<IntegrationInstallation>;
};

export async function withMigrationLeaseHeartbeat<T>(input: {
    repository: IntegrationInstallationRepository;
    installation: IntegrationInstallation;
    clock: MigrationClock;
    leaseMs: number;
    operation: (lease: MigrationLeaseController) => Promise<T>;
}): Promise<{ value: T; installation: IntegrationInstallation }> {
    let latest = input.installation;
    let heartbeatFailure: unknown;
    let heartbeat: Promise<void> | undefined;
    let updateQueue = Promise.resolve();
    const update = (
        operation: (installation: IntegrationInstallation) => Promise<IntegrationInstallation>,
    ): Promise<IntegrationInstallation> => {
        const scheduled = updateQueue.then(async () => {
            if (heartbeatFailure) {
                throw new IntegrationRuntimeError("integration migration lease heartbeat failed", 409);
            }
            latest = await operation(latest);
            return latest;
        });
        updateQueue = scheduled.then(
            () => undefined,
            () => undefined,
        );
        return scheduled;
    };
    const intervalMs = Math.max(100, Math.floor(input.leaseMs / 3));
    const timer = setInterval(() => {
        if (heartbeat || heartbeatFailure) {
            return;
        }
        heartbeat = update(
            async (installation) => await renewLease(input.repository, installation, input.clock, input.leaseMs),
        )
            .then(() => undefined)
            .catch((error) => {
                heartbeatFailure = error;
            })
            .finally(() => {
                heartbeat = undefined;
            });
    }, intervalMs);

    try {
        const value = await input.operation({ current: () => latest, update });
        if (heartbeat) {
            await heartbeat;
        }
        await updateQueue;
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
