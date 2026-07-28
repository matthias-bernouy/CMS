import { randomUUID } from "node:crypto";
import { IntegrationInputError, IntegrationRuntimeError } from "../../../errors";
import type { IntegrationInstallation } from "../../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../../interfaces/IntegrationInstallationRepository";
import { appendRun, failedRun } from "../runs";
import { replaceCurrentInstallation } from "./claim";

export type AbandonPendingIntegrationOperationRequest = {
    installations: IntegrationInstallationRepository;
    installationId: string;
    expectedOperationId?: string;
    expectedUpdatedAt: Date;
    actor: string;
    reason: string;
    confirmation: string;
    now?: () => Date;
};

export function pendingIntegrationOperationAbandonmentConfirmation(operationId: string): string {
    return `confirm owner stopped and abandon pending integration operation ${operationId}; external reconciliation required`;
}

export function legacyPendingIntegrationOperationAbandonmentConfirmation(
    installationId: string,
    expectedUpdatedAt: Date,
): string {
    return `confirm owner stopped and abandon legacy pending integration ${installationId} at ${expectedUpdatedAt.toISOString()}; external reconciliation required`;
}

/**
 * Fences a stopped operation owner and restores its last durable source document.
 * External writes and artifact cleanup are not rolled back; an operator must reconcile them.
 */
export async function abandonPendingIntegrationOperation(
    request: AbandonPendingIntegrationOperationRequest,
): Promise<IntegrationInstallation> {
    const installation = await request.installations.get(request.installationId);
    if (!installation) {
        throw new IntegrationInputError("installationId", "integration installation was not found");
    }
    if (installation.status !== "pending" || installation.updatedAt.getTime() !== request.expectedUpdatedAt.getTime()) {
        throw new IntegrationRuntimeError("pending integration operation changed; reload before abandonment", 409);
    }
    const operation = installation.pendingOperation;
    const migration = installation.migrationOperation;
    if (migration && migration.status !== "completed" && migration.status !== "aborted") {
        throw new IntegrationRuntimeError(
            `pending state belongs to unfinished migration "${migration.id}"; use migration recovery or abort`,
            409,
        );
    }
    if (operation ? operation.id !== request.expectedOperationId : request.expectedOperationId !== undefined) {
        throw new IntegrationRuntimeError("pending integration operation changed; reload before abandonment", 409);
    }
    const actor = boundedText(request.actor, "actor", 256);
    const reason = boundedText(request.reason, "reason", 2_048);
    const expectedConfirmation = operation
        ? pendingIntegrationOperationAbandonmentConfirmation(operation.id)
        : legacyPendingIntegrationOperationAbandonmentConfirmation(installation.id, installation.updatedAt);
    if (request.confirmation !== expectedConfirmation) {
        throw new IntegrationInputError(
            "confirmation",
            "does not acknowledge pending operation abandonment and required external reconciliation",
        );
    }
    if (!request.installations.compareAndSwapMigration) {
        throw new IntegrationRuntimeError("installation repository does not support pending operation abandonment");
    }
    const abandonedAt = request.now?.() ?? new Date();
    const restoredSource = operation
        ? {
              ...operation.sourceState,
              definitionSnapshot: operation.sourceState.definitionSnapshot,
              packageDigest: operation.sourceState.packageDigest,
              connectorBindings: operation.sourceState.connectorBindings,
          }
        : installation;
    const operationId = operation?.id ?? `legacy-markerless:${installation.id}:${installation.updatedAt.toISOString()}`;
    const restored: IntegrationInstallation = {
        ...installation,
        ...restoredSource,
        status: "failed",
        pendingOperation: undefined,
        pendingOperationAbandonments: [
            ...(installation.pendingOperationAbandonments ?? []),
            {
                id: randomUUID(),
                operationId,
                ...(!operation ? { legacyMarkerless: true as const } : {}),
                actor,
                reason,
                abandonedAt,
                externalReconciliationRequired: true,
            },
        ],
    };
    const failure = failedRun(
        restoredSource.runCount + 1,
        operation?.startedAt ?? installation.updatedAt,
        new Error(`operator abandoned pending operation; external reconciliation required: ${reason}`),
    );
    return await replaceCurrentInstallation(
        request.installations,
        installation,
        appendRun(restored, failure, { status: "failed" }),
    );
}

function boundedText(value: string, field: string, maximum: number): string {
    if (typeof value !== "string" || value.trim() !== value || value.length < 1 || value.length > maximum) {
        throw new IntegrationInputError(field, `must contain between 1 and ${maximum} characters`);
    }
    return value;
}
