import { getRowByField, listRows } from "../../db/postgrest.ts";
import { markPaymentManualReview } from "../../db/repositories/payout-controls.ts";
import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import { refundSelect, type RefundRow } from "../../db/records/refunds.ts";
import { transferRecoverySelect, type TransferRecoveryRow } from "../../db/records/transfers.ts";
import { publicPayment } from "../../domain/payments/presentation.ts";
import { normalizeProtectedRefundOperation } from "../../domain/refunds/presentation.ts";
import { HttpError } from "../../http/errors.ts";
import { errorMessage, isRecord } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import type { ExecuteTransferReversal } from "../payments/transfer-reversal/workflow.ts";
import type { RecordSellerRecoveryExposure, RequiredPayment } from "../payments/transfer-reversal/types.ts";
import type { ExecuteRefund } from "./execution.ts";

export type ProtectedRefundInput = {
    refundRequestId: string;
    commerceRefundRequestId: number | null;
    amount: number;
    authorizedSellerAmount: number;
    sellerEntitlementReductionAmount: number;
    reason: string | null;
};

type ProtectedRefundDependencies = {
    executeRefund: ExecuteRefund;
    executeTransferReversal: ExecuteTransferReversal;
    recordSellerRecoveryExposure: RecordSellerRecoveryExposure;
    requiredPayment: RequiredPayment;
};

export type ExecuteProtectedRefund = (payment: ConnectPaymentRow, input: ProtectedRefundInput) => Promise<JsonRecord>;

export function createProtectedRefundWorkflow({
    executeRefund,
    executeTransferReversal,
    recordSellerRecoveryExposure,
    requiredPayment,
}: ProtectedRefundDependencies): ExecuteProtectedRefund {
    return async function executeProtectedRefund(payment, input) {
        const {
            refundRequestId,
            commerceRefundRequestId,
            amount,
            authorizedSellerAmount,
            sellerEntitlementReductionAmount,
            reason,
        } = input;
        if (sellerEntitlementReductionAmount < 0 || sellerEntitlementReductionAmount > amount) {
            throw new HttpError(400, "sellerEntitlementReductionAmount must be between zero and the refund amount");
        }
        if (authorizedSellerAmount < 0 || authorizedSellerAmount > payment.seller_transfer_amount) {
            throw new HttpError(400, "authorizedSellerAmount is invalid");
        }
        const existingRefund = await getRowByField<RefundRow>(
            "refunds",
            "refund_request_id",
            refundRequestId,
            refundSelect,
        );
        if (existingRefund) {
            if (
                existingRefund.authorized_seller_amount_after_refund !== authorizedSellerAmount ||
                existingRefund.seller_entitlement_reduction_amount !== sellerEntitlementReductionAmount
            ) {
                throw new HttpError(409, "refund seller entitlement replay mismatch");
            }
        } else {
            const refunds = await listRows<RefundRow>(
                `refunds?payment_id=eq.${payment.id}&select=${encodeURIComponent(refundSelect)}`,
            );
            if (
                refunds.some((refund) => ["reserved", "processing", "pending", "manual_review"].includes(refund.status))
            ) {
                throw new HttpError(409, "another refund is awaiting terminal provider confirmation");
            }
            const committedReductionAmount = refunds
                .filter((refund) => refund.status === "succeeded")
                .reduce((sum, refund) => sum + refund.seller_entitlement_reduction_amount, 0);
            const expectedAuthorizedSellerAmount =
                payment.seller_transfer_amount - committedReductionAmount - sellerEntitlementReductionAmount;
            if (expectedAuthorizedSellerAmount !== authorizedSellerAmount) {
                throw new HttpError(409, "refund seller entitlement target is stale or invalid");
            }
        }
        const netTransferredAmount = payment.transferred_amount - payment.reversed_amount;
        const requiredRecoveryNow = Math.max(0, netTransferredAmount - authorizedSellerAmount);
        const recoveryRequestId = `${refundRequestId}:seller-recovery`;
        const existingRecovery = await getRowByField<TransferRecoveryRow>(
            "transfer_recovery_requests",
            "recovery_request_id",
            recoveryRequestId,
            transferRecoverySelect,
        );
        let reversal: JsonRecord | null = null;
        const requestedRecoveryAmount = existingRecovery?.requested_amount ?? requiredRecoveryNow;
        if (requestedRecoveryAmount > 0) {
            try {
                reversal = await executeTransferReversal(payment, recoveryRequestId, requestedRecoveryAmount, reason);
            } catch (error) {
                await recordSellerRecoveryExposure(
                    payment,
                    recoveryRequestId,
                    "refund_recovery",
                    "debt",
                    requestedRecoveryAmount,
                    "Protected Refund seller recovery is not available",
                    { refundRequestId, error: errorMessage(error) },
                ).catch(() => null);
                await markPaymentManualReview(payment.id, "Protected Refund seller recovery failed", {
                    refundRequestId,
                    recoveryRequestId,
                    error: errorMessage(error),
                }).catch(() => null);
                throw new HttpError(409, "seller recovery failed; refund requires finance review");
            }
            payment = await requiredPayment(payment.id);
            if (payment.transferred_amount - payment.reversed_amount > authorizedSellerAmount) {
                throw new HttpError(409, "seller recovery is not confirmed; refund remains blocked");
            }
        }
        const refund = await executeRefund(
            payment,
            refundRequestId,
            commerceRefundRequestId,
            amount,
            requestedRecoveryAmount,
            sellerEntitlementReductionAmount,
            authorizedSellerAmount,
            reason,
        );
        const currentPayment = await requiredPayment(payment.id);
        const reversalOperations =
            isRecord(reversal) && Array.isArray(reversal.reversals)
                ? reversal.reversals
                      .filter(isRecord)
                      .map((child) =>
                          normalizeProtectedRefundOperation("reversal", child, currentPayment.last_stripe_event_id),
                      )
                : [];
        const operations = [
            ...reversalOperations,
            normalizeProtectedRefundOperation("refund", refund, currentPayment.last_stripe_event_id),
        ];
        return { payment: publicPayment(currentPayment), reversal, refund, operations };
    };
}
