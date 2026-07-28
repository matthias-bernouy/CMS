import { randomUUID } from "node:crypto";
import { IntegrationInputError, IntegrationRuntimeError } from "../../../errors";
import type { IntegrationInstallation } from "../../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../../interfaces/IntegrationInstallationRepository";
import { requiredMigrationJournalEntry, requiredMigrationOperation } from "../shared";
import type { MigrationClock } from "../state";

const RECONCILIATION_PHASE = "reconcile-declarative" as const;

export type RetryAmbiguousMigrationReconciliationRequest = {
    installations: IntegrationInstallationRepository;
    installationId: string;
    expectedOperationId: string;
    expectedRevision: number;
    actor: string;
    reason: string;
    confirmation: string;
    clock: MigrationClock;
};

export function ambiguousMigrationReconciliationRetryConfirmation(operationId: string): string {
    return `retry ambiguous migration reconciliation ${operationId}`;
}

export async function retryAmbiguousMigrationReconciliation(
    request: RetryAmbiguousMigrationReconciliationRequest,
): Promise<IntegrationInstallation> {
    const installation = await request.installations.get(request.installationId);
    if (!installation) {
        throw new IntegrationInputError("installationId", "integration installation was not found");
    }
    const operation = requiredMigrationOperation(installation);
    if (operation.id !== request.expectedOperationId || operation.revision !== request.expectedRevision) {
        throw new IntegrationRuntimeError("migration reconciliation state changed; reload before retrying", 409);
    }
    if (operation.status !== "paused") {
        throw new IntegrationRuntimeError("ambiguous migration reconciliation can only be retried while paused", 409);
    }
    const entry = requiredMigrationJournalEntry(operation.journal, RECONCILIATION_PHASE);
    if ((entry.status !== "running" && entry.status !== "failed") || !entry.attemptId) {
        throw new IntegrationRuntimeError("migration reconciliation does not have an ambiguous outcome", 409);
    }
    const actor = boundedText(request.actor, "actor", 256);
    const reason = boundedText(request.reason, "reason", 2_048);
    if (request.confirmation !== ambiguousMigrationReconciliationRetryConfirmation(operation.id)) {
        throw new IntegrationInputError("confirmation", "does not acknowledge the ambiguous reconciliation retry");
    }
    if (!request.installations.compareAndSwapMigration) {
        throw new IntegrationRuntimeError("installation repository does not support fenced migrations");
    }
    const now = request.clock.now();
    const resolution = {
        id: randomUUID(),
        action: "retry" as const,
        actor,
        reason,
        resolvedAt: now,
        previousAttemptId: entry.attemptId,
        previousStatus: entry.status,
    };
    const next: IntegrationInstallation = {
        ...installation,
        updatedAt: now,
        migrationOperation: {
            ...operation,
            revision: operation.revision + 1,
            updatedAt: now,
            reconciliationResolutions: [...(operation.reconciliationResolutions ?? []), resolution],
            journal: operation.journal.map((candidate) =>
                candidate.id === entry.id
                    ? {
                          ...candidate,
                          status: "pending" as const,
                          attemptId: undefined,
                          startedAt: undefined,
                          error: undefined,
                          externalOperationId: undefined,
                          confirmationDigest: undefined,
                          importResult: undefined,
                          confirmedAt: undefined,
                      }
                    : candidate,
            ),
        },
    };
    const saved = await request.installations.compareAndSwapMigration(installation, next);
    if (!saved) {
        throw new IntegrationRuntimeError("migration reconciliation state changed concurrently", 409);
    }
    return saved;
}

function boundedText(value: string, field: string, maximum: number): string {
    if (typeof value !== "string" || value.trim() !== value || value.length < 1 || value.length > maximum) {
        throw new IntegrationInputError(field, `must contain between 1 and ${maximum} characters`);
    }
    return value;
}
