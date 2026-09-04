import { updateRow } from "../../db/postgrest.ts";
import { upsertProviderException } from "../../db/repositories/events-exceptions.ts";
import {
    enqueueCommerceRefundProjection,
    updateFinancialOperation,
} from "../../db/repositories/financial-operations.ts";
import { readRefundProjectionContext } from "../../db/repositories/ledger.ts";
import { updatePayment } from "../../db/repositories/payments.ts";
import { refundSelect, type RefundRow } from "../../db/records/refunds.ts";
import { HttpError } from "../../http/errors.ts";
import type { StripeRefund } from "../../provider/types.ts";
import { numberAt, recordArrayAt, stringAt } from "../../shared/data.ts";
import { refundStatusFromStripe, resolveRefundBalanceTransaction } from "./provider-truth.ts";

export type ApplyStripeRefund = (refund: RefundRow, provider: StripeRefund) => Promise<void>;

export function createRefundProjectionWorkflow(): ApplyStripeRefund {
    return async function applyStripeRefund(refund, provider) {
        const status = refundStatusFromStripe(provider);
        if (["succeeded", "failed", "cancelled"].includes(refund.status) && refund.status !== status) {
            await upsertProviderException(`refund-terminal-conflict:${refund.id}`, {
                payment_id: refund.payment_id,
                operation_id: refund.operation_id,
                exception_type: "refund_terminal_state_conflict",
                severity: "critical",
                message: "Stripe reported a refund state after a different terminal state was recorded",
                details: { refundId: refund.id, recordedStatus: refund.status, providerSnapshot: provider },
            });
            return;
        }
        const balanceTransaction =
            status === "succeeded" ? await resolveRefundBalanceTransaction(provider, refund) : null;
        const updatedRefund =
            (await updateRow<RefundRow>(
                "refunds",
                refund.id,
                {
                    status,
                    failure_reason: stringAt(provider, "failure_reason") || null,
                    stripe_balance_transaction_id: balanceTransaction
                        ? stringAt(balanceTransaction, "id")
                        : refund.stripe_balance_transaction_id,
                    actual_stripe_fee_amount: balanceTransaction
                        ? numberAt(balanceTransaction, "fee")
                        : refund.actual_stripe_fee_amount,
                    actual_stripe_net_amount: balanceTransaction
                        ? numberAt(balanceTransaction, "net")
                        : refund.actual_stripe_net_amount,
                    actual_stripe_fee_currency: balanceTransaction
                        ? stringAt(balanceTransaction, "currency").toLowerCase()
                        : refund.actual_stripe_fee_currency,
                    actual_stripe_fee_details: balanceTransaction
                        ? recordArrayAt(balanceTransaction, "fee_details")
                        : refund.actual_stripe_fee_details,
                    provider_snapshot: provider,
                },
                refundSelect,
            )) ?? refund;
        await updateFinancialOperation(refund.operation_id, {
            status:
                status === "succeeded"
                    ? "succeeded"
                    : ["failed", "cancelled"].includes(status)
                      ? "failed"
                      : "processing",
            stripe_object_id: provider.id,
            response: provider,
            last_error: ["failed", "cancelled"].includes(status)
                ? stringAt(provider, "failure_reason") || `Stripe Refund ${status}`
                : null,
            completed_at: status === "succeeded" ? new Date().toISOString() : null,
        });
        if (["pending", "succeeded", "failed", "cancelled"].includes(status)) {
            await enqueueCommerceRefundProjection(updatedRefund.id);
        }
        const context = await readRefundProjectionContext(refund.payment_id);
        const payment = context.payment;
        if (!payment) {
            throw new HttpError(404, "payment not found");
        }
        const authorizedSellerAmount = payment.seller_transfer_amount - context.sellerRecoveryAmount;
        await updatePayment(refund.payment_id, {
            refunded_amount: context.refundedAmount,
            actual_stripe_refund_fee_amount: context.refundFeeAmount,
            actual_stripe_processing_fee_amount: payment.actual_stripe_charge_fee_amount + context.refundFeeAmount,
            settlement_status:
                status === "failed"
                    ? "manual_review"
                    : status === "pending"
                      ? "refund_pending"
                      : payment.settlement_status === "manual_review"
                        ? "manual_review"
                        : context.refundedAmount >= payment.amount_total
                          ? "refunded"
                          : payment.transferred_amount - payment.reversed_amount >= authorizedSellerAmount
                            ? "released"
                            : "held",
            last_provider_sync_at: new Date().toISOString(),
        });
    };
}
