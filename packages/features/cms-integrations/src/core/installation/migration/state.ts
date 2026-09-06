import { randomUUID } from "node:crypto";
import { IntegrationRuntimeError } from "../../errors";
import type {
    IntegrationInstallation,
    IntegrationMigrationOperation,
} from "../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../interfaces/IntegrationInstallationRepository";
import type { IntegrationMigrationConnectorTransition } from "../../../interfaces/IntegrationConnectorDeployer";

export type MigrationClock = { now(): Date };

export type MigrationOwner = Pick<IntegrationMigrationOperation, "id" | "attemptId" | "fencingToken">;

export const systemMigrationClock: MigrationClock = { now: () => new Date() };

export function migrationOwner(operation: IntegrationMigrationOperation): MigrationOwner {
    return {
        id: operation.id,
        attemptId: operation.attemptId,
        fencingToken: operation.fencingToken,
    };
}

export function isMigrationOwner(
    operation: IntegrationMigrationOperation | undefined,
    expected: MigrationOwner,
): operation is IntegrationMigrationOperation {
    return (
        operation?.id === expected.id &&
        operation.attemptId === expected.attemptId &&
        operation.fencingToken === expected.fencingToken
    );
}

export function assertMigrationOwner(
    operation: IntegrationMigrationOperation | undefined,
    expected: MigrationOwner,
): asserts operation is IntegrationMigrationOperation {
    if (!isMigrationOwner(operation, expected)) {
        throw new IntegrationRuntimeError("integration migration attempt was fenced", 409);
    }
}

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
    allowAbortRequested?: boolean;
}): Promise<IntegrationInstallation> {
    const now = input.clock.now();
    if (input.installation.managementLease && input.installation.managementLease.expiresAt.getTime() > now.getTime()) {
        throw new IntegrationRuntimeError("Integration management operation is in progress", 409);
    }
    const current = input.installation.migrationOperation;
    const unfinished = current && current.status !== "completed" && current.status !== "aborted" ? current : undefined;
    if (!unfinished && input.repository.compareAndSwapMigration && input.installation.status === "pending") {
        throw new IntegrationRuntimeError("integration installation has another operation in progress", 409);
    }
    if (unfinished) {
        if (unfinished.abortRequestedAt && !input.allowAbortRequested) {
            throw new IntegrationRuntimeError(
                `integration migration "${unfinished.id}" has an abort compensation in progress`,
                409,
            );
        }
        if (
            unfinished.targetVersion !== input.targetVersion ||
            unfinished.targetPackageDigest !== input.targetPackageDigest
        ) {
            throw new IntegrationRuntimeError(`integration already has unfinished migration "${unfinished.id}"`);
        }
        if (
            (unfinished.status === "running" || unfinished.status === "activated") &&
            unfinished.leaseExpiresAt.getTime() > now.getTime()
        ) {
            throw new IntegrationRuntimeError(
                `integration migration "${unfinished.id}" is leased by another attempt`,
                409,
            );
        }
    }
    const attemptId = randomUUID();
    const operation =
        unfinished && unfinished.targetVersion === input.targetVersion
            ? {
                  ...unfinished,
                  revision: unfinished.revision + 1,
                  status: unfinished.status === "activated" ? ("activated" as const) : ("running" as const),
                  attemptId,
                  fencingToken: unfinished.fencingToken + 1,
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
                  sourceState: {
                      connectorBindings: structuredClone(input.installation.connectorBindings ?? {}),
                      artifacts: structuredClone(input.installation.artifacts),
                  },
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
        pendingOperation: undefined,
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
    assertMigrationOwner(current, migrationOwner(expected));
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
