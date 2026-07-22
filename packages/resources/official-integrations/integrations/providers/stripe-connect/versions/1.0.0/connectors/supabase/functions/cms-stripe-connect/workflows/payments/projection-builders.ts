import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import { chargeId, isTransientBalanceTransactionExpansionReview } from "../../domain/payments/provider-state.ts";
import type { ProviderTruthActorKind, StripePaymentIntent } from "../../provider/types.ts";
import { digest } from "../../shared/crypto.ts";
import { isRecord, numberAt, recordArrayAt, stringAt } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";

export async function buildAppliedPaymentProjection(
    payment: ConnectPaymentRow,
    intent: StripePaymentIntent,
    paymentStatus: string,
    expectedPaymentIntentId: string | undefined,
    options: { actorKind: ProviderTruthActorKind; actorId: string },
): Promise<JsonRecord> {
    const charge = paymentStatus === "succeeded" && isRecord(intent.latest_charge) ? intent.latest_charge : null;
    const balanceTransaction = charge && isRecord(charge.balance_transaction) ? charge.balance_transaction : null;
    const chargeFee = balanceTransaction ? (numberAt(balanceTransaction, "fee") ?? 0) : 0;
    const projected: ConnectPaymentRow = {
        ...payment,
        payment_status: paymentStatus,
        stripe_payment_intent_id: expectedPaymentIntentId ?? intent.id,
        stripe_charge_id:
            paymentStatus === "succeeded" ? (chargeId(intent) ?? payment.stripe_charge_id) : payment.stripe_charge_id,
        stripe_charge_balance_transaction_id: balanceTransaction
            ? stringAt(balanceTransaction, "id")
            : payment.stripe_charge_balance_transaction_id,
        actual_stripe_charge_fee_amount:
            paymentStatus === "succeeded" ? chargeFee : payment.actual_stripe_charge_fee_amount,
        actual_stripe_processing_fee_amount:
            paymentStatus === "succeeded"
                ? chargeFee + payment.actual_stripe_refund_fee_amount
                : payment.actual_stripe_processing_fee_amount,
        actual_stripe_charge_net_amount: balanceTransaction
            ? numberAt(balanceTransaction, "net")
            : payment.actual_stripe_charge_net_amount,
        actual_stripe_fee_currency: balanceTransaction
            ? stringAt(balanceTransaction, "currency").toLowerCase()
            : payment.actual_stripe_fee_currency,
        actual_stripe_charge_fee_details: balanceTransaction
            ? recordArrayAt(balanceTransaction, "fee_details")
            : payment.actual_stripe_charge_fee_details,
        paid_at: paymentStatus === "succeeded" ? (payment.paid_at ?? new Date().toISOString()) : payment.paid_at,
        cancelled_at:
            paymentStatus === "cancelled" ? (payment.cancelled_at ?? new Date().toISOString()) : payment.cancelled_at,
        last_provider_sync_at: new Date().toISOString(),
    };
    const recovery =
        isTransientBalanceTransactionExpansionReview(payment) &&
        paymentStatus === "succeeded" &&
        charge &&
        balanceTransaction
            ? {
                  exceptionKey: `provider-payment-truth:${payment.id}:${intent.id}`,
                  paymentIntentId: intent.id,
                  chargeId: stringAt(charge, "id"),
                  balanceTransactionId: stringAt(balanceTransaction, "id"),
                  actorKind: options.actorKind,
                  actorId: options.actorId,
              }
            : null;
    return {
        kind: "apply",
        paymentStatus: projected.payment_status,
        stripePaymentIntentId: projected.stripe_payment_intent_id,
        stripeChargeId: projected.stripe_charge_id,
        stripeChargeBalanceTransactionId: projected.stripe_charge_balance_transaction_id,
        actualStripeChargeFeeAmount: projected.actual_stripe_charge_fee_amount,
        actualStripeProcessingFeeAmount: projected.actual_stripe_processing_fee_amount,
        actualStripeChargeNetAmount: projected.actual_stripe_charge_net_amount,
        actualStripeFeeCurrency: projected.actual_stripe_fee_currency,
        actualStripeChargeFeeDetails: projected.actual_stripe_charge_fee_details,
        paidAt: projected.paid_at,
        cancelledAt: projected.cancelled_at,
        lastProviderSyncAt: projected.last_provider_sync_at,
        projectionKey: await paymentProjectionKey(projected, options.actorId, paymentStatus),
        recoveredProjectionKey: recovery
            ? await paymentProjectionKey(
                  { ...projected, settlement_status: "held", manual_review_reason: null },
                  options.actorId,
                  paymentStatus,
              )
            : null,
        recovery,
    };
}

export async function buildQuarantinePaymentProjection(
    payment: ConnectPaymentRow,
    intent: StripePaymentIntent,
    mismatches: string[],
    options: { actorKind: ProviderTruthActorKind; actorId: string },
): Promise<JsonRecord> {
    const reason = `Stripe payment provider truth mismatch: ${mismatches.join(", ")}`;
    const details = {
        paymentIntentId: intent.id,
        chargeId: chargeId(intent),
        mismatches,
    };
    return {
        kind: "quarantine",
        paymentStatus: "failed",
        settlementStatus: "manual_review",
        manualReviewReason: reason,
        stripePaymentIntentId: payment.stripe_payment_intent_id ?? (intent.id === "missing" ? null : intent.id),
        stripeChargeId: payment.stripe_charge_id ?? chargeId(intent),
        paidAt: null,
        lastProviderSyncAt: new Date().toISOString(),
        projectionKey: `payment:${payment.id}:${options.actorId}:quarantine:${await digest(JSON.stringify(mismatches))}`,
        exceptionKey: `provider-payment-truth:${payment.id}:${intent.id}`,
        actorKind: options.actorKind,
        actorId: options.actorId,
        details,
    };
}

async function paymentProjectionKey(
    payment: ConnectPaymentRow,
    actorId: string,
    paymentStatus: string,
): Promise<string> {
    const projectionState = await digest(
        JSON.stringify({
            paymentStatus: payment.payment_status,
            settlementStatus: payment.settlement_status,
            disputeStatus: payment.dispute_status,
            manualReviewReason: payment.manual_review_reason,
            chargeId: payment.stripe_charge_id,
            balanceTransactionId: payment.stripe_charge_balance_transaction_id,
            refundedAmount: payment.refunded_amount,
            transferredAmount: payment.transferred_amount,
            reversedAmount: payment.reversed_amount,
        }),
    );
    return `payment:${payment.id}:${actorId}:${paymentStatus}:${payment.stripe_charge_id ?? "none"}:${projectionState}`;
}
