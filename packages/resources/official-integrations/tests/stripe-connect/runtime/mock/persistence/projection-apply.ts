import { isDeepStrictEqual } from "node:util";
import { jsonResponse } from "../../http";
import { asRecord, same } from "../../records";
import type { JsonRecord } from "../../types";
import { TransferPersistence } from "./transfers";

export class PaymentProjectionApplyPersistence extends TransferPersistence {
    applyPaymentProviderProjection(body: JsonRecord): Response {
        const payment = this.tables.payments.find((row) => same(row.id, body.p_payment_id));
        if (!payment) {
            return jsonResponse({ message: "not_found: payment" }, 400);
        }
        this.applyNextProtectedPaymentProjectionScenario(payment);
        const projection = asRecord(body.p_projection);
        const expectedPayment = asRecord(body.p_expected_payment);
        const equivalentApply =
            !isDeepStrictEqual(payment, expectedPayment) &&
            this.isEquivalentPaymentApply(payment, expectedPayment, projection);
        if (!isDeepStrictEqual(payment, expectedPayment) && !equivalentApply) {
            return jsonResponse({ applied: false, payment: { ...payment } });
        }
        const snapshot = this.paymentProjectionSnapshot();
        if (equivalentApply) {
            this.update(payment, {
                last_provider_sync_at: this.latestProviderSyncAt(payment, projection),
            });
            const failed = this.paymentProjectionEnqueueFailure(snapshot);
            if (failed) {
                return failed;
            }
            this.enqueuePaymentProviderProjection(payment, String(projection.projectionKey));
        } else if (projection.kind === "apply") {
            this.update(payment, {
                payment_status: projection.paymentStatus,
                stripe_payment_intent_id: projection.stripePaymentIntentId,
                stripe_charge_id: projection.stripeChargeId,
                stripe_charge_balance_transaction_id: projection.stripeChargeBalanceTransactionId,
                actual_stripe_charge_fee_amount: projection.actualStripeChargeFeeAmount,
                actual_stripe_processing_fee_amount: projection.actualStripeProcessingFeeAmount,
                actual_stripe_charge_net_amount: projection.actualStripeChargeNetAmount,
                actual_stripe_fee_currency: projection.actualStripeFeeCurrency,
                actual_stripe_charge_fee_details: projection.actualStripeChargeFeeDetails,
                paid_at: projection.paidAt,
                cancelled_at: projection.cancelledAt,
                last_provider_sync_at: this.latestProviderSyncAt(payment, projection),
            });
            const recovered = this.recoverProjectedPaymentReview(payment, projection.recovery);
            const projectionKey = recovered
                ? String(projection.recoveredProjectionKey)
                : String(projection.projectionKey);
            const failed = this.paymentProjectionEnqueueFailure(snapshot);
            if (failed) {
                return failed;
            }
            this.enqueuePaymentProviderProjection(payment, projectionKey);
        } else if (projection.kind === "quarantine") {
            this.update(payment, {
                payment_status: projection.paymentStatus,
                settlement_status: projection.settlementStatus,
                manual_review_reason: projection.manualReviewReason,
                stripe_payment_intent_id: projection.stripePaymentIntentId,
                stripe_charge_id: projection.stripeChargeId,
                paid_at: projection.paidAt,
                last_provider_sync_at: this.latestProviderSyncAt(payment, projection),
            });
            const failed = this.paymentProjectionEnqueueFailure(snapshot);
            if (failed) {
                return failed;
            }
            this.enqueuePaymentProviderProjection(payment, String(projection.projectionKey));
            this.upsertProjectedProviderException(
                String(projection.exceptionKey),
                payment,
                String(projection.manualReviewReason),
                asRecord(projection.details),
            );
            this.insertGeneric("payment_events", {
                payment_id: payment.id,
                event_type: "provider_payment_truth_mismatch",
                actor_kind: projection.actorKind,
                actor_id: projection.actorId,
                previous_payment_status: null,
                next_payment_status: null,
                previous_settlement_status: null,
                next_settlement_status: null,
                data: projection.details,
            });
        } else {
            throw new Error(`unexpected payment provider projection kind ${String(projection.kind)}`);
        }
        if (this.losePaymentProjectionEnqueueResponse) {
            this.losePaymentProjectionEnqueueResponse = false;
            throw new Error("simulated lost payment projection response");
        }
        return jsonResponse({ applied: true, payment: { ...payment } });
    }
}
