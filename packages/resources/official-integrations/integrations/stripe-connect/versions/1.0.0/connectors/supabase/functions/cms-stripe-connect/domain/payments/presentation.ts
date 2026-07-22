import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { isTransientBalanceTransactionExpansionReview } from "./provider-state.ts";

export function publicPayment(row: ConnectPaymentRow): JsonRecord {
    return {
        paymentId: row.id,
        providerPaymentId: row.id,
        clientReferenceId: row.client_reference_id,
        financialTermsHash: row.financial_terms_hash,
        financialRevision: row.financial_revision,
        dualApprovalThresholdAmount: row.dual_approval_threshold_amount,
        buyerUserId: row.buyer_cms_user_id,
        sellerUserId: row.seller_cms_user_id,
        stripePaymentIntentId: row.stripe_payment_intent_id,
        stripeChargeId: row.stripe_charge_id,
        stripeChargeBalanceTransactionId: row.stripe_charge_balance_transaction_id,
        providerEventId: row.last_stripe_event_id,
        transferGroup: row.transfer_group,
        currency: row.currency,
        amountTotal: row.amount_total,
        sellerTransferAmount: row.seller_transfer_amount,
        platformRetainedAmount: row.platform_retained_amount,
        refundedAmount: row.refunded_amount,
        transferredAmount: row.transferred_amount,
        reversedAmount: row.reversed_amount,
        actualStripeChargeFeeAmount: row.actual_stripe_charge_fee_amount,
        actualStripeRefundFeeAmount: row.actual_stripe_refund_fee_amount,
        actualStripeProcessingFeeAmount: row.actual_stripe_processing_fee_amount,
        actualStripeChargeNetAmount: row.actual_stripe_charge_net_amount,
        actualStripeFeeCurrency: row.actual_stripe_fee_currency,
        actualStripeChargeFeeDetails: row.actual_stripe_charge_fee_details,
        actualPlatformMarginAfterStripeAmount: row.platform_retained_amount - row.actual_stripe_processing_fee_amount,
        paymentStatus: row.payment_status,
        commercePaymentStatus:
            row.settlement_status === "manual_review" || row.manual_review_reason !== null
                ? "manual_review"
                : row.payment_status,
        settlementStatus: row.settlement_status,
        disputeStatus: row.dispute_status,
        reconciliationPending: isTransientBalanceTransactionExpansionReview(row),
        manualReviewReason: row.manual_review_reason,
        description: row.description,
        paidAt: row.paid_at,
        cancelledAt: row.cancelled_at,
        lastProviderSyncAt: row.last_provider_sync_at,
        occurredAt: row.updated_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function publicPaymentWithClientSecret(row: ConnectPaymentRow, clientSecret: string): JsonRecord {
    return {
        ...publicPayment(row),
        clientSecret,
    };
}
