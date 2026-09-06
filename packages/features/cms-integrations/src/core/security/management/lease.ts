import { randomUUID } from "node:crypto";
import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import { IntegrationRuntimeError, MissingIntegrationInstallationError } from "../../errors";
import type { IntegrationManagementDeps } from "./contracts";
const LEASE_MS = 60_000;

export async function withManagementLease<T>(
    deps: IntegrationManagementDeps,
    id: string,
    operation: (installation: IntegrationInstallation) => Promise<T>,
): Promise<T> {
    const current = await deps.installations.get(id);
    if (!current) {
        throw new MissingIntegrationInstallationError(id);
    }
    if (!deps.installations.compareAndSwapMigration) {
        throw new IntegrationRuntimeError("Management requires atomic installation updates", 503);
    }
    if (
        current.status === "pending" ||
        (current.migrationOperation && !["completed", "aborted"].includes(current.migrationOperation.status))
    ) {
        throw new IntegrationRuntimeError("Integration deployment is in progress", 409);
    }
    if (current.managementLease && current.managementLease.expiresAt.getTime() > now(deps).getTime()) {
        conflict();
    }
    const claimed = await deps.installations.compareAndSwapMigration(current, {
        ...current,
        updatedAt: nextTime(deps, current),
        managementLease: { id: randomUUID(), expiresAt: new Date(now(deps).getTime() + LEASE_MS) },
    });
    if (!claimed) {
        conflict();
    }
    let heartbeat: Promise<void> = Promise.resolve();
    let lost = false;
    const timer = setInterval(() => {
        heartbeat = heartbeat.then(async () => {
            if (lost) {
                return;
            }
            try {
                const current = await verifyManagementLease(deps, claimed);
                const renewed = await deps.installations.compareAndSwapMigration!(current, {
                    ...current,
                    updatedAt: nextTime(deps, current),
                    managementLease: {
                        id: claimed.managementLease!.id,
                        expiresAt: new Date(now(deps).getTime() + LEASE_MS),
                    },
                });
                if (!renewed) {
                    lost = true;
                }
            } catch {
                lost = true;
            }
        });
    }, LEASE_MS / 3);
    try {
        return await operation(claimed);
    } finally {
        clearInterval(timer);
        await heartbeat;
        const current = await deps.installations.get(id);
        if (current?.managementLease?.id === claimed.managementLease!.id) {
            const { managementLease: _lease, ...rest } = current;
            await deps.installations.compareAndSwapMigration!(current, { ...rest, updatedAt: nextTime(deps, current) });
        }
    }
}
export async function verifyManagementLease(
    deps: IntegrationManagementDeps,
    installation: IntegrationInstallation,
): Promise<IntegrationInstallation> {
    if (!installation.managementLease) {
        return installation;
    }
    const current = await deps.installations.get(installation.id);
    if (
        !current ||
        current.managementLease?.id !== installation.managementLease.id ||
        current.managementLease.expiresAt.getTime() <= now(deps).getTime() ||
        current.definitionVersion !== installation.definitionVersion ||
        current.status === "pending"
    ) {
        conflict();
    }
    return current;
}
export function nextTime(deps: IntegrationManagementDeps, installation: IntegrationInstallation): Date {
    return new Date(Math.max(now(deps).getTime(), installation.updatedAt.getTime() + 1));
}
function now(deps: IntegrationManagementDeps): Date {
    return deps.now?.() ?? new Date();
}
function conflict(): never {
    throw new IntegrationRuntimeError("Integration management operation was fenced or is already running", 409);
}
