import { randomUUID } from "node:crypto";
import { IntegrationRuntimeError } from "../../../errors";
import type { IntegrationInstallation } from "../../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../../interfaces/IntegrationInstallationRepository";

export async function claimPendingIntegrationOperation(
    repository: IntegrationInstallationRepository,
    installation: IntegrationInstallation,
): Promise<IntegrationInstallation> {
    if (installation.managementLease && installation.managementLease.expiresAt.getTime() > Date.now()) {
        throw new IntegrationRuntimeError("Integration management operation is in progress", 409);
    }
    if (!repository.compareAndSwapMigration) {
        return await repository.replace({ ...installation, status: "pending", updatedAt: new Date() });
    }
    return await replaceCurrentInstallation(repository, installation, {
        ...installation,
        status: "pending",
        pendingOperation: {
            id: randomUUID(),
            startedAt: new Date(),
            sourceState: {
                status: installation.status,
                definitionVersion: installation.definitionVersion,
                ...(installation.definitionSnapshot
                    ? { definitionSnapshot: structuredClone(installation.definitionSnapshot) }
                    : {}),
                ...(installation.packageDigest ? { packageDigest: installation.packageDigest } : {}),
                ...(installation.connectorBindings
                    ? { connectorBindings: structuredClone(installation.connectorBindings) }
                    : {}),
                answersSnapshot: structuredClone(installation.answersSnapshot),
                secretRefs: structuredClone(installation.secretRefs),
                secretInputs: structuredClone(installation.secretInputs),
                artifacts: structuredClone(installation.artifacts),
                ...(installation.activeResources
                    ? { activeResources: structuredClone(installation.activeResources) }
                    : {}),
                runCount: installation.runCount,
                runs: structuredClone(installation.runs),
            },
        },
    });
}

export async function replaceCurrentInstallation(
    repository: IntegrationInstallationRepository,
    expected: IntegrationInstallation,
    next: IntegrationInstallation,
): Promise<IntegrationInstallation> {
    const saved = await tryReplaceCurrentInstallation(repository, expected, next);
    if (!saved) {
        throw new IntegrationRuntimeError("integration installation state changed concurrently", 409);
    }
    return saved;
}

export async function tryReplaceCurrentInstallation(
    repository: IntegrationInstallationRepository,
    expected: IntegrationInstallation,
    next: IntegrationInstallation,
): Promise<IntegrationInstallation | null> {
    if (!repository.compareAndSwapMigration) {
        return await repository.replace({
            ...next,
            updatedAt: new Date(Math.max(Date.now(), minimumTimestamp(expected))),
        });
    }
    const updatedAt = new Date(Math.max(Date.now(), minimumTimestamp(expected)));
    return await repository.compareAndSwapMigration(expected, { ...next, updatedAt });
}

function minimumTimestamp(expected: IntegrationInstallation): number {
    return expected.updatedAt.getTime() + 1;
}
