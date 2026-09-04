import { claimReconciliationProjectionBatch, readReconciliationOperations } from "../../db/reconciliation.ts";
import type { StripeDisputeRow } from "../../db/records/disputes.ts";
import type { CommerceProjectionOutboxRow, FinancialOperationRow } from "../../db/records/operations.ts";
import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import { publicFinancialOperation } from "../../domain/admin/financial-operation.ts";
import { projectPublicDisputeWithContext } from "../../domain/disputes/presentation.ts";
import { publicPayment } from "../../domain/payments/presentation.ts";
import { HttpError } from "../../http/errors.ts";
import { objectAt, stringAt, stripUndefined } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";

export async function publicReconciliationRun(
    run: JsonRecord,
    limit: number,
    projectionOwner: string,
): Promise<JsonRecord> {
    const operationReads = await readReconciliationOperations(limit);
    const operations = operationReads.map((read) =>
        publicFinancialOperation(
            read.operation as unknown as FinancialOperationRow,
            read.client_reference_id === null
                ? null
                : {
                      client_reference_id: read.client_reference_id,
                      currency: read.payment_currency ?? "",
                  },
        ),
    );
    const claimedReads = await claimReconciliationProjectionBatch(projectionOwner, limit);
    const claimedPublic = claimedReads.map((read) => {
        const projection = read.projection as unknown as CommerceProjectionOutboxRow;
        const lease = {
            projectionId: projection.id,
            projectionClaimToken: projection.claim_token,
            projectionAttemptCount: projection.attempt_count,
            recoveryKey: projection.recovery_key,
            causalSequence: projection.causal_sequence,
        };
        if (projection.projection_kind === "payment") {
            if (!read.payment) {
                throw new HttpError(404, "payment not found");
            }
            const payment = read.payment as unknown as ConnectPaymentRow;
            return {
                kind: "payment",
                value: {
                    ...publicPayment(payment),
                    providerEventId: projection.projection_key,
                    ...lease,
                },
            };
        }
        if (projection.projection_kind === "dispute") {
            if (!read.dispute) {
                throw new Error(`projection ${projection.id} has no Stripe dispute`);
            }
            if (read.dispute_client_reference_id === null) {
                throw new HttpError(404, "payment not found");
            }
            const dispute = read.dispute as unknown as StripeDisputeRow;
            return {
                kind: "dispute",
                value: {
                    ...projectPublicDisputeWithContext(dispute, {
                        clientReferenceId: read.dispute_client_reference_id,
                        staged: read.staged_evidence,
                        evidenceSubmissionCount: Number(read.evidence_submission_count),
                        pendingApproval: read.pending_approval,
                    }),
                    providerEventId: projection.projection_key,
                    ...lease,
                },
            };
        }
        if (!projection.operation_id) {
            throw new Error(`projection ${projection.id} has no financial operation id`);
        }
        if (!read.financial_operation) {
            throw new Error(`projection ${projection.id} has no financial operation`);
        }
        const operation = read.financial_operation as unknown as FinancialOperationRow;
        const payment = read.operation_payment as unknown as ConnectPaymentRow | null;
        const publicOperation = publicCommerceOperation(publicFinancialOperation(operation, payment));
        if (!publicOperation) {
            return null;
        }
        if (projection.projection_kind === "refund") {
            const payload = projection.projection_payload ?? {};
            return {
                kind: "operation",
                value: {
                    ...publicOperation,
                    providerEventId: projection.projection_key,
                    status: stringAt(payload, "status") || publicOperation.status,
                    refundRequestId: payload.refundRequestId ?? publicOperation.refundRequestId,
                    commerceRefundRequestId: payload.commerceRefundRequestId ?? publicOperation.commerceRefundRequestId,
                    providerSnapshot: objectAt(payload, "providerSnapshot"),
                    occurredAt: payload.occurredAt ?? publicOperation.occurredAt,
                    ...lease,
                },
            };
        }
        return {
            kind: "operation",
            value: {
                ...publicOperation,
                providerEventId: projection.projection_key,
                ...lease,
            },
        };
    });
    const paymentProjections = claimedPublic
        .filter((entry): entry is { kind: string; value: JsonRecord } => entry?.kind === "payment")
        .map((entry) => entry.value);
    const commerceOperations = claimedPublic
        .filter((entry): entry is { kind: string; value: JsonRecord } => entry?.kind === "operation")
        .map((entry) => entry.value);
    const disputeProjections = claimedPublic
        .filter((entry): entry is { kind: string; value: JsonRecord } => entry?.kind === "dispute")
        .map((entry) => entry.value);
    return {
        runId: run.id,
        runKey: run.run_key,
        status: run.status,
        scannedCount: run.scanned_count,
        repairedCount: run.repaired_count,
        exceptionCount: run.exception_count,
        details: run.details,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
        payments: paymentProjections,
        operations,
        commerceOperations,
        disputes: disputeProjections,
    };
}

function publicCommerceOperation(operation: JsonRecord): JsonRecord | null {
    const rawType = stringAt(operation, "operationType");
    const operationType =
        rawType === "transfer_create"
            ? "transfer"
            : rawType === "transfer_reversal_create"
              ? "reversal"
              : rawType === "refund_create"
                ? "refund"
                : null;
    if (!operationType) {
        return null;
    }
    return stripUndefined({
        orderPublicId: operation.clientReferenceId ?? null,
        paymentId: operation.paymentId ?? null,
        providerPaymentId: operation.providerPaymentId ?? null,
        providerOperationId: operation.providerOperationId,
        providerEventId: operation.providerEventId,
        operationType,
        status: operation.status,
        amount: operation.amount,
        currency: operation.currency,
        releaseAuthorizationId: operation.releaseAuthorizationId ?? undefined,
        refundRequestId: operation.refundRequestId ?? undefined,
        commerceRefundRequestId: operation.commerceRefundRequestId ?? undefined,
        providerSnapshot: operation.response ?? {},
        occurredAt: operation.occurredAt,
        createdAt: operation.createdAt,
        updatedAt: operation.updatedAt,
    });
}
