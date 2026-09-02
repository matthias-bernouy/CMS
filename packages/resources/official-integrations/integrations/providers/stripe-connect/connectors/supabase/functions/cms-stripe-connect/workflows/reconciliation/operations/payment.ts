import { readFinancialOperationRecoveryContext } from "../../../db/reconciliation.ts";
import {
    enqueueCommerceRefundProjection,
    updateFinancialOperation,
} from "../../../db/repositories/financial-operations.ts";
import type { FinancialOperationRow } from "../../../db/records/operations.ts";
import type { ConnectPaymentRow } from "../../../db/records/payments.ts";
import type { RefundRow } from "../../../db/records/refunds.ts";
import type { TransferRecoveryRow, TransferRow } from "../../../db/records/transfers.ts";
import { HttpError } from "../../../http/errors.ts";
import { createStripePaymentIntent, retrievePaymentIntent } from "../../../provider/payments.ts";
import type { StripePaymentIntent } from "../../../provider/types.ts";
import { isRecord } from "../../../shared/data.ts";
import type { JsonRecord } from "../../../shared/types.ts";
import { executePaymentIntentCancellation } from "../../payments/cancellation.ts";
import { applyPaymentIntent } from "../../payments/projection.ts";
import type { ExecuteSettlementRelease } from "../../payments/settlement-release.ts";
import type { ExecuteTransferReversal } from "../../payments/transfer-reversal/workflow.ts";
import type { ExecuteRefund } from "../../refunds/execution.ts";
import {
    optionalOperationInteger,
    optionalOperationString,
    requiredOperationInteger,
    requiredOperationString,
} from "../../operations/request-values.ts";
import { requiredReleaseKind } from "../../../http/query.ts";

type PaymentOperationRecoveryDependencies = {
    requiredPayment(paymentId: number): Promise<ConnectPaymentRow>;
    executeSettlementRelease: ExecuteSettlementRelease;
    executeTransferReversal: ExecuteTransferReversal;
    executeRefund: ExecuteRefund;
};

export type RecoverPaymentOperation = (operation: FinancialOperationRow) => Promise<boolean>;
export function createPaymentOperationRecovery({
    requiredPayment,
    executeSettlementRelease,
    executeTransferReversal,
    executeRefund,
}: PaymentOperationRecoveryDependencies): RecoverPaymentOperation {
    return async function recoverPaymentOperation(operation) {
        if (!operation.payment_id) {
            return false;
        }
        const usesRecoveryContext =
            operation.operation_type === "transfer_create" ||
            operation.operation_type === "transfer_reversal_create" ||
            operation.operation_type === "refund_create";
        const rawRecoveryRequestId = operation.request.recoveryRequestId;
        const recoveryContext = usesRecoveryContext
            ? await readFinancialOperationRecoveryContext(
                  operation.payment_id,
                  operation.id,
                  typeof rawRecoveryRequestId === "string" ? rawRecoveryRequestId : null,
              )
            : null;
        const payment = recoveryContext
            ? (recoveryContext.payment as unknown as ConnectPaymentRow | null)
            : await requiredPayment(operation.payment_id);
        if (!payment) {
            throw new HttpError(404, "payment not found");
        }
        if (operation.operation_type === "payment_intent_create") {
            await recoverPaymentIntentCreation(payment, operation);
            return true;
        }
        if (operation.operation_type === "payment_intent_cancel") {
            await executePaymentIntentCancellation(
                payment,
                operation,
                "reconciliation",
                requiredOperationString(operation, "cancellationRequestId"),
            );
            return true;
        }
        if (operation.operation_type === "transfer_create") {
            const localTransfer = recoveryContext?.transfer as unknown as TransferRow | null;
            if (localTransfer?.stripe_transfer_id && localTransfer.status === "succeeded") {
                await succeedFromLocalRow(operation, localTransfer.stripe_transfer_id, localTransfer.provider_snapshot);
                return true;
            }
            await executeSettlementRelease(
                payment,
                requiredOperationString(operation, "releaseAuthorizationId"),
                requiredReleaseKind(requiredOperationString(operation, "releaseKind")),
                requiredOperationInteger(operation, "amount"),
                requiredOperationString(operation, "currency"),
            );
            return true;
        }
        if (operation.operation_type === "transfer_reversal_create") {
            const localReversal = recoveryContext?.transfer_reversal;
            if (localReversal?.stripe_transfer_reversal_id && localReversal.status === "succeeded") {
                await succeedFromLocalRow(
                    operation,
                    localReversal.stripe_transfer_reversal_id,
                    isRecord(localReversal.provider_snapshot) ? localReversal.provider_snapshot : {},
                );
                return true;
            }
            const recoveryRequestId = requiredOperationString(operation, "recoveryRequestId");
            const recovery = recoveryContext?.transfer_recovery as unknown as TransferRecoveryRow | null;
            if (!recovery) {
                throw new Error(`operation ${operation.id} has no Transfer recovery parent`);
            }
            await executeTransferReversal(payment, recoveryRequestId, recovery.requested_amount, recovery.reason);
            return true;
        }
        if (operation.operation_type === "refund_create") {
            const localRefund = recoveryContext?.refund as unknown as RefundRow | null;
            if (localRefund?.stripe_refund_id && ["pending", "succeeded"].includes(localRefund.status)) {
                await updateFinancialOperation(operation.id, {
                    status: localRefund.status === "succeeded" ? "succeeded" : "processing",
                    stripe_object_id: localRefund.stripe_refund_id,
                    response: localRefund.provider_snapshot ?? {},
                    last_error: null,
                    completed_at: localRefund.status === "succeeded" ? new Date().toISOString() : null,
                });
                await enqueueCommerceRefundProjection(localRefund.id);
                return true;
            }
            await executeRefund(
                payment,
                requiredOperationString(operation, "refundRequestId"),
                optionalOperationInteger(operation, "commerceRefundRequestId"),
                requiredOperationInteger(operation, "amount"),
                requiredOperationInteger(operation, "requiredReversalAmount"),
                requiredOperationInteger(operation, "sellerEntitlementReductionAmount"),
                requiredOperationInteger(operation, "authorizedSellerAmount"),
                optionalOperationString(operation, "reason"),
            );
            return true;
        }
        return false;
    };
}

async function recoverPaymentIntentCreation(
    payment: ConnectPaymentRow,
    operation: FinancialOperationRow,
): Promise<void> {
    let intent: StripePaymentIntent;
    if (operation.stripe_object_id) {
        intent = await retrievePaymentIntent(operation.stripe_object_id);
    } else if (payment.stripe_payment_intent_id) {
        intent = await retrievePaymentIntent(payment.stripe_payment_intent_id);
    } else {
        const operationAge = Date.now() - Date.parse(operation.created_at);
        if (!Number.isFinite(operationAge) || operationAge >= 23 * 60 * 60 * 1000) {
            throw new Error("PaymentIntent recovery exceeded the Stripe idempotency safety window");
        }
        intent = await createStripePaymentIntent(payment);
    }
    const applied = await applyPaymentIntent(payment, intent, {
        actorKind: "reconciliation",
        actorId: "financial-operation-recovery",
    });
    await updateFinancialOperation(operation.id, {
        status: applied.settlement_status === "manual_review" ? "manual_review" : "succeeded",
        stripe_object_id: intent.id,
        response: intent,
        last_error: applied.settlement_status === "manual_review" ? applied.manual_review_reason : null,
        completed_at: new Date().toISOString(),
    });
}

async function succeedFromLocalRow(
    operation: FinancialOperationRow,
    stripeObjectId: string,
    response: JsonRecord,
): Promise<void> {
    await updateFinancialOperation(operation.id, {
        status: "succeeded",
        stripe_object_id: stripeObjectId,
        response,
        last_error: null,
        completed_at: new Date().toISOString(),
    });
}
