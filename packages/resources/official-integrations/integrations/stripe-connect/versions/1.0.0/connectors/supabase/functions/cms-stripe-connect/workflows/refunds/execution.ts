import { getRowByField, insertRow, updateRow } from "../../db/postgrest.ts";
import { reserveFinancialOperation, updateFinancialOperation } from "../../db/repositories/financial-operations.ts";
import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import { refundSelect, type RefundRow } from "../../db/records/refunds.ts";
import { publicRefund } from "../../domain/refunds/presentation.ts";
import { HttpError } from "../../http/errors.ts";
import { createStripeRefund, retrieveStripeRefund } from "../../provider/refunds.ts";
import type { StripeRefund } from "../../provider/types.ts";
import { stableStripeIdempotencyKey } from "../../shared/crypto.ts";
import type { JsonRecord } from "../../shared/types.ts";
import type { MoveOperationToManualReview } from "../payments/transfer-reversal/types.ts";
import { findStripeRefund } from "./provider-truth.ts";
import type { ApplyStripeRefund } from "./projection.ts";

type RefundExecutionDependencies = {
    applyStripeRefund: ApplyStripeRefund;
    moveOperationToManualReview: MoveOperationToManualReview;
};

export type ExecuteRefund = (
    payment: ConnectPaymentRow,
    refundRequestId: string,
    commerceRefundRequestId: number | null,
    amount: number,
    requiredReversalAmount: number,
    sellerEntitlementReductionAmount: number,
    authorizedSellerAmount: number,
    reason: string | null,
) => Promise<JsonRecord>;

export function createRefundExecutionWorkflow({
    applyStripeRefund,
    moveOperationToManualReview,
}: RefundExecutionDependencies): ExecuteRefund {
    return async function executeRefund(
        payment,
        refundRequestId,
        commerceRefundRequestId,
        amount,
        requiredReversalAmount,
        sellerEntitlementReductionAmount,
        authorizedSellerAmount,
        reason,
    ) {
        if (payment.payment_status !== "succeeded" || !payment.stripe_charge_id) {
            throw new HttpError(409, "payment is not refundable");
        }
        const existingRefund = await getRowByField<RefundRow>(
            "refunds",
            "refund_request_id",
            refundRequestId,
            refundSelect,
        );
        if (existingRefund) {
            if (
                existingRefund.payment_id !== payment.id ||
                existingRefund.amount !== amount ||
                existingRefund.required_reversal_amount !== requiredReversalAmount ||
                existingRefund.seller_entitlement_reduction_amount !== sellerEntitlementReductionAmount ||
                existingRefund.authorized_seller_amount_after_refund !== authorizedSellerAmount ||
                (existingRefund.commerce_refund_request_id ?? null) !== commerceRefundRequestId
            ) {
                throw new HttpError(409, "refund request replay mismatch");
            }
            if (["succeeded", "pending"].includes(existingRefund.status)) {
                return publicRefund(existingRefund);
            }
        }
        if (amount <= 0 || payment.refunded_amount + amount > payment.amount_total) {
            throw new HttpError(409, "refund exceeds the remaining captured amount");
        }
        if (requiredReversalAmount < 0 || requiredReversalAmount > amount) {
            throw new HttpError(400, "requiredReversalAmount is invalid");
        }
        if (payment.transferred_amount - payment.reversed_amount > authorizedSellerAmount) {
            throw new HttpError(409, "required seller Transfer Reversal is not confirmed");
        }
        const businessKey = `refund:${payment.id}:${refundRequestId}`;
        const operation = await reserveFinancialOperation(payment.id, {
            businessKey,
            operationType: "refund_create",
            request: {
                refundRequestId,
                commerceRefundRequestId,
                chargeId: payment.stripe_charge_id,
                amount,
                requiredReversalAmount,
                sellerEntitlementReductionAmount,
                authorizedSellerAmount,
                currency: payment.currency,
                reason,
            },
        });
        let refund = existingRefund;
        if (!refund) {
            refund = await insertRow<RefundRow>("refunds", refundSelect, {
                payment_id: payment.id,
                operation_id: operation.id,
                refund_request_id: refundRequestId,
                commerce_refund_request_id: commerceRefundRequestId,
                stripe_charge_id: payment.stripe_charge_id,
                amount,
                required_reversal_amount: requiredReversalAmount,
                seller_entitlement_reduction_amount: sellerEntitlementReductionAmount,
                authorized_seller_amount_after_refund: authorizedSellerAmount,
                currency: payment.currency,
                reason,
                status: "reserved",
            });
        } else if (
            refund.payment_id !== payment.id ||
            refund.amount !== amount ||
            refund.required_reversal_amount !== requiredReversalAmount ||
            refund.seller_entitlement_reduction_amount !== sellerEntitlementReductionAmount ||
            refund.authorized_seller_amount_after_refund !== authorizedSellerAmount ||
            (refund.commerce_refund_request_id ?? null) !== commerceRefundRequestId
        ) {
            throw new HttpError(409, "refund request replay mismatch");
        }
        try {
            let stripeRefund: StripeRefund | null = null;
            if (operation.status === "succeeded" && operation.stripe_object_id) {
                stripeRefund = await retrieveStripeRefund(operation.stripe_object_id);
            } else if (operation.attempt_count > 0) {
                stripeRefund = await findStripeRefund(payment.stripe_charge_id, refundRequestId, amount);
                if (!stripeRefund && operation.status === "manual_review") {
                    throw new HttpError(409, "Refund outcome is unresolved and requires finance review");
                }
            }
            if (!stripeRefund) {
                await updateFinancialOperation(operation.id, {
                    status: "processing",
                    claimed_at: new Date().toISOString(),
                    attempt_count: operation.attempt_count + 1,
                });
                await updateRow("refunds", refund.id, { status: "processing" });
                stripeRefund = await createStripeRefund(
                    payment.stripe_charge_id,
                    amount,
                    refundRequestId,
                    reason,
                    await stableStripeIdempotencyKey("refund", businessKey),
                );
            }
            refund =
                (await updateRow<RefundRow>(
                    "refunds",
                    refund.id,
                    {
                        stripe_refund_id: stripeRefund.id,
                    },
                    refundSelect,
                )) ?? refund;
            await applyStripeRefund(refund, stripeRefund);
            refund = (await getRowByField<RefundRow>("refunds", "id", String(refund.id), refundSelect)) ?? refund;
            return publicRefund(refund);
        } catch (error) {
            await moveOperationToManualReview(payment.id, operation, error, "refund_create_ambiguous");
            throw error;
        }
    };
}
