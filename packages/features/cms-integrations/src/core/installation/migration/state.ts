import { randomUUID } from "node:crypto";
import { IntegrationRuntimeError } from "../../errors";
import type {
    IntegrationInstallation,
    IntegrationMigrationOperation,
} from "../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../interfaces/IntegrationInstallationRepository";
import type { IntegrationMigrationConnectorTransition } from "../../../interfaces/IntegrationConnectorDeployer";

export type MigrationClock = { now(): Date };

export const systemMigrationClock: MigrationClock = { now: () => new Date() };

export async function claimMigrationOperation(input: {
    repository: IntegrationInstallationRepository;
    installation: IntegrationInstallation;
    targetVersion: string;
    targetPackageDigest: string;
    operationId: string;
    targetDefinition: IntegrationMigrationOperation["targetDefinition"];
    connectors: IntegrationMigrationConnectorTransition[];
    journal: IntegrationMigrationOperation["journal"];
    clock: MigrationClock;
    leaseMs: number;
}): Promise<IntegrationInstallation> {
    const now = input.clock.now();
    const current = input.installation.migrationOperation;
    if (current && current.status !== "completed" && current.status !== "aborted") {
        if (
            current.targetVersion !== input.targetVersion ||
            current.targetPackageDigest !== input.targetPackageDigest
        ) {
            throw new IntegrationRuntimeError(`integration already has unfinished migration "${current.id}"`);
        }
        if (
            (current.status === "running" || current.status === "activated") &&
            current.leaseExpiresAt.getTime() > now.getTime()
        ) {
            throw new IntegrationRuntimeError(
                `integration migration "${current.id}" is leased by another attempt`,
                409,
            );
        }
    }
    const attemptId = randomUUID();
    const operation =
        current && current.targetVersion === input.targetVersion
            ? {
                  ...current,
                  revision: current.revision + 1,
                  status: current.status === "activated" ? ("activated" as const) : ("running" as const),
                  attemptId,
                  fencingToken: current.fencingToken + 1,
                  leaseExpiresAt: new Date(now.getTime() + input.leaseMs),
                  updatedAt: now,
              }
            : {
                  id: input.operationId,
                  revision: 1,
                  status: "running" as const,
                  currentVersion: input.installation.definitionVersion,
                  ...(input.installation.packageDigest
                      ? { currentPackageDigest: input.installation.packageDigest }
                      : {}),
                  targetVersion: input.targetVersion,
                  targetPackageDigest: input.targetPackageDigest,
                  sourceDefinition: input.installation.definitionSnapshot ?? input.targetDefinition,
                  targetDefinition: input.targetDefinition,
                  connectors: structuredClone(input.connectors),
                  attemptId,
                  fencingToken: 1,
                  leaseExpiresAt: new Date(now.getTime() + input.leaseMs),
                  startedAt: now,
                  updatedAt: now,
                  journal: input.journal,
              };
    return await cas(input.repository, input.installation, {
        ...input.installation,
        status: "pending",
        updatedAt: now,
        migrationOperation: operation,
    });
}

export async function updateMigrationInstallation(input: {
    repository: IntegrationInstallationRepository;
    installation: IntegrationInstallation;
    operation: IntegrationMigrationOperation;
    clock: MigrationClock;
    leaseMs: number;
    patch?: Partial<IntegrationInstallation>;
}): Promise<IntegrationInstallation> {
    assertFence(input.installation, input.operation, input.clock.now());
    const now = input.clock.now();
    const nextOperation = {
        ...input.operation,
        revision: input.operation.revision + 1,
        updatedAt: now,
        leaseExpiresAt: new Date(now.getTime() + input.leaseMs),
    };
    return await cas(input.repository, input.installation, {
        ...input.installation,
        ...input.patch,
        updatedAt: now,
        migrationOperation: nextOperation,
    });
}

export function assertFence(
    installation: IntegrationInstallation,
    expected: IntegrationMigrationOperation,
    now: Date,
): void {
    const current = installation.migrationOperation;
    if (
        !current ||
        current.id !== expected.id ||
        current.attemptId !== expected.attemptId ||
        current.fencingToken !== expected.fencingToken
    ) {
        throw new IntegrationRuntimeError("integration migration attempt was fenced", 409);
    }
    if (current.leaseExpiresAt.getTime() <= now.getTime()) {
        throw new IntegrationRuntimeError("integration migration lease expired", 409);
    }
}

async function cas(
    repository: IntegrationInstallationRepository,
    expected: IntegrationInstallation,
    next: IntegrationInstallation,
): Promise<IntegrationInstallation> {
    if (!repository.compareAndSwapMigration) {
        throw new IntegrationRuntimeError("installation repository does not support fenced migrations");
    }
    const saved = await repository.compareAndSwapMigration(expected, next);
    if (!saved) {
        throw new IntegrationRuntimeError("integration migration state changed concurrently", 409);
    }
    return saved;
}
