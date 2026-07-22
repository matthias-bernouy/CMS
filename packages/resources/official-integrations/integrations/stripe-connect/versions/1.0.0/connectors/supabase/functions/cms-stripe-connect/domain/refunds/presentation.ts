import type { RefundRow } from "../../db/records/refunds.ts";
import type { JsonRecord } from "../../shared/types.ts";

export function publicRefund(row: RefundRow): JsonRecord {
    return {
        refundId: row.id,
        providerOperationId: row.operation_id,
        paymentId: row.payment_id,
        refundRequestId: row.refund_request_id,
        commerceRefundRequestId: row.commerce_refund_request_id ?? null,
        stripeRefundId: row.stripe_refund_id,
        stripeBalanceTransactionId: row.stripe_balance_transaction_id,
        amount: row.amount,
        requiredReversalAmount: row.required_reversal_amount,
        sellerEntitlementReductionAmount: row.seller_entitlement_reduction_amount,
        authorizedSellerAmount: row.authorized_seller_amount_after_refund,
        currency: row.currency,
        reason: row.reason,
        status: row.status,
        failureReason: row.failure_reason,
        actualStripeFeeAmount: row.actual_stripe_fee_amount,
        actualStripeNetAmount: row.actual_stripe_net_amount,
        actualStripeFeeCurrency: row.actual_stripe_fee_currency,
        actualStripeFeeDetails: row.actual_stripe_fee_details,
        occurredAt: row.updated_at,
        providerSnapshot: row.provider_snapshot,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function normalizeProtectedRefundOperation(
    operationType: "reversal" | "refund",
    operation: JsonRecord,
    providerEventId: string | null,
): JsonRecord {
    return {
        providerEventId: providerEventId || `operation:${operation.providerOperationId}:${operation.status}`,
        providerOperationId: operation.providerOperationId,
        operationType,
        providerOperationObjectId:
            operationType === "reversal" ? operation.stripeTransferReversalId : operation.stripeRefundId,
        status: operation.status,
        amount: operation.amount,
        currency: operation.currency,
        occurredAt: operation.occurredAt,
        refundRequestId: operationType === "refund" ? operation.refundRequestId : null,
        commerceRefundRequestId: operationType === "refund" ? (operation.commerceRefundRequestId ?? null) : null,
        providerSnapshot: operation.providerSnapshot ?? null,
    };
}
