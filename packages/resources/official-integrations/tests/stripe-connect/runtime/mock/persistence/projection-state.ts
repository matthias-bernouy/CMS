import { isDeepStrictEqual } from "node:util";
import { same } from "../../records";
import type { JsonRecord } from "../../types";
import { PaymentProjectionApplyPersistence } from "./projection-apply";

export class PaymentProjectionStatePersistence extends PaymentProjectionApplyPersistence {
    applyNextProtectedPaymentProjectionScenario(payment: JsonRecord): void {
        const scenario = this.nextProtectedPaymentProjectionScenario;
        if (!scenario) {
            return;
        }
        this.nextProtectedPaymentProjectionScenario = null;
        if (!same(payment.id, scenario.paymentId)) {
            throw new Error(`payment projection scenario expected payment ${scenario.paymentId}`);
        }
        const paymentIntentId = String(payment.stripe_payment_intent_id);
        const intent = this.paymentIntents.get(paymentIntentId);
        if (!intent) {
            throw new Error(`payment projection scenario has no PaymentIntent ${paymentIntentId}`);
        }
        if (scenario.kind === "replace-intent") {
            this.paymentIntents.set(scenario.replacementIntentId, {
                ...intent,
                id: scenario.replacementIntentId,
                client_secret: `${scenario.replacementIntentId}_secret`,
            });
            this.update(payment, { stripe_payment_intent_id: scenario.replacementIntentId });
            return;
        }
        if (scenario.kind === "cancel-payment") {
            Object.assign(intent, {
                status: "canceled",
                canceled_at: Math.floor(Date.now() / 1000),
                client_secret: scenario.clientSecret,
            });
            this.update(payment, {
                payment_status: "cancelled",
                cancelled_at: "2026-07-06T12:09:00.000Z",
            });
            return;
        }
        intent.client_secret = scenario.clientSecret;
    }

    latestProviderSyncAt(payment: JsonRecord, projection: JsonRecord): unknown {
        return Date.parse(String(payment.last_provider_sync_at)) > Date.parse(String(projection.lastProviderSyncAt))
            ? payment.last_provider_sync_at
            : projection.lastProviderSyncAt;
    }

    isEquivalentPaymentApply(payment: JsonRecord, expected: JsonRecord, projection: JsonRecord): boolean {
        if (projection.kind !== "apply" || projection.recovery !== null || projection.recoveredProjectionKey !== null) {
            return false;
        }
        const target = {
            ...expected,
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
            last_provider_sync_at: payment.last_provider_sync_at,
            updated_at: payment.updated_at,
        };
        if (expected.paid_at === null && payment.paid_at !== null && projection.paidAt !== null) {
            target.paid_at = payment.paid_at;
        }
        if (expected.cancelled_at === null && payment.cancelled_at !== null && projection.cancelledAt !== null) {
            target.cancelled_at = payment.cancelled_at;
        }
        return isDeepStrictEqual(payment, target);
    }
}
