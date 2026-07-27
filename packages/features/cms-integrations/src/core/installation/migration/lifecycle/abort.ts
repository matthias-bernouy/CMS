import { IntegrationInputError, IntegrationRuntimeError } from "../../../errors";
import type { IntegrationInstallation } from "../../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../../interfaces/IntegrationInstallationRepository";
import type {
    IntegrationMigrationPhase,
    IntegrationMigrationRuntime,
} from "../../../../interfaces/IntegrationConnectorDeployer";
import { claimMigrationOperation, type MigrationClock, systemMigrationClock } from "../state";
import { finishAbort, pauseAbortCompensation, persistAbortIntent } from "./abortState";
import { compensateMigrationPhase } from "./compensation";

const COMPENSATION_PHASES: IntegrationMigrationPhase[] = ["switch-cms-binding", "provider-direct-transition"];

export type AbortIntegrationMigrationRequest = {
    installations: IntegrationInstallationRepository;
    integrationId: string;
    actor: string;
    reason: string;
    targetPackageRoot: string;
    runtime: IntegrationMigrationRuntime;
    clock?: MigrationClock;
    leaseMs?: number;
};

export async function abortIntegrationMigration(
    input: AbortIntegrationMigrationRequest,
): Promise<IntegrationInstallation> {
    const initial = await input.installations.get(input.integrationId);
    const existing = initial?.migrationOperation;
    if (!initial || !existing) {
        throw new IntegrationInputError("integrationId", "integration has no migration to abort");
    }
    if (existing.status === "aborted") {
        return initial;
    }
    assertAbortable(existing);
    const actor = boundedText(input.actor, "actor", 256);
    const reason = boundedText(input.reason, "reason", 2_048);
    const targetPackageRoot = boundedText(input.targetPackageRoot, "targetPackageRoot", 4_096);
    assertExistingAbortIntent(existing, actor, reason);
    const clock = input.clock ?? systemMigrationClock;
    const leaseMs = validatedLeaseMs(input.leaseMs ?? 60_000);
    let installation = await claimMigrationOperation({
        repository: input.installations,
        installation: initial,
        targetVersion: existing.targetVersion,
        targetPackageDigest: existing.targetPackageDigest,
        operationId: existing.id,
        targetDefinition: existing.targetDefinition,
        connectors: existing.connectors,
        journal: existing.journal,
        clock,
        leaseMs,
        allowAbortRequested: true,
    });
    installation = await persistAbortIntent(input.installations, installation, actor, reason, clock, leaseMs);
    try {
        for (const phase of COMPENSATION_PHASES) {
            installation = await compensateMigrationPhase(
                input.installations,
                installation,
                input.runtime,
                targetPackageRoot,
                phase,
                clock,
                leaseMs,
            );
        }
        return await finishAbort(input.installations, installation, clock, leaseMs);
    } catch (error) {
        await pauseAbortCompensation(input.installations, installation.id, clock, leaseMs, error);
        throw error;
    }
}

function assertAbortable(operation: NonNullable<IntegrationInstallation["migrationOperation"]>): void {
    if (operation.status === "completed" || operation.pointOfNoReturnReachedAt) {
        throw new IntegrationRuntimeError("migration cannot be aborted after its point of no return", 409);
    }
    if (operation.activatedAt && !operation.sourceState) {
        throw new IntegrationRuntimeError("activated legacy migration has no rollback state", 409);
    }
}

function assertExistingAbortIntent(
    operation: NonNullable<IntegrationInstallation["migrationOperation"]>,
    actor: string,
    reason: string,
): void {
    if (operation.abortRequestedAt && (operation.abortRequestedBy !== actor || operation.abortReason !== reason)) {
        throw new IntegrationRuntimeError("migration abort intent already exists with different provenance", 409);
    }
}

function boundedText(value: string, field: string, maximum: number): string {
    if (typeof value !== "string" || value.trim() !== value || value.length < 1 || value.length > maximum) {
        throw new IntegrationInputError(field, `must contain between 1 and ${maximum} characters`);
    }
    return value;
}

function validatedLeaseMs(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1_000 || value > 3_600_000) {
        throw new IntegrationRuntimeError("migration lease must be between 1000 and 3600000 milliseconds");
    }
    return value;
}
