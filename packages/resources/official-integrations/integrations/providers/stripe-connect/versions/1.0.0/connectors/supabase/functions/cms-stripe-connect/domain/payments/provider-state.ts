import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import type { StripePaymentIntent } from "../../provider/types.ts";
import { isRecord } from "../../shared/data.ts";

const transientBalanceTransactionExpansionReviewReason =
    "Stripe payment provider truth mismatch: charge_balance_transaction_expansion";

export function isTransientBalanceTransactionExpansionReview(payment: ConnectPaymentRow): boolean {
    return (
        payment.settlement_status === "manual_review" &&
        payment.manual_review_reason === transientBalanceTransactionExpansionReviewReason
    );
}

export function paymentStatusFromStripe(paymentIntent: StripePaymentIntent): string {
    switch (paymentIntent.status) {
        case "succeeded":
            return "succeeded";
        case "canceled":
            return "cancelled";
        case "requires_action":
        case "requires_confirmation":
        case "requires_capture":
            return "requires_action";
        case "requires_payment_method":
            return "created";
        case "processing":
            return "processing";
        default:
            return "created";
    }
}

export function chargeId(paymentIntent: StripePaymentIntent): string | null {
    const latestCharge = paymentIntent.latest_charge;
    if (typeof latestCharge === "string") {
        return latestCharge;
    }
    if (isRecord(latestCharge) && typeof latestCharge.id === "string") {
        return latestCharge.id;
    }
    return null;
}
