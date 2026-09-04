import { getRowByField } from "../../db/postgrest.ts";
import { insertPaymentEvent } from "../../db/repositories/events-exceptions.ts";
import { updatePayment } from "../../db/repositories/payments.ts";
import { paymentSelect, type ConnectPaymentRow } from "../../db/records/payments.ts";
import { refundSelect, type RefundRow } from "../../db/records/refunds.ts";
import { chargeId } from "../../domain/payments/provider-state.ts";
import { retrieveStripeDispute } from "../../provider/disputes.ts";
import { retrievePaymentIntent } from "../../provider/payments.ts";
import { retrieveStripeRefundSnapshot } from "../../provider/refunds.ts";
import type { StripeDispute } from "../../provider/types.ts";
import { isRecord, objectAt, stringAt } from "../../shared/data.ts";
import { stripeV1ApiVersion, stripeV2ApiVersion } from "../../shared/runtime.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { applyPaymentIntent, quarantineProviderPaymentTruth } from "../payments/projection.ts";
import type { ApplyStripeRefund } from "../refunds/projection.ts";
import {
    processStripeAccountUpdatedEvent,
    processStripePayoutEvent,
    processStripeTransferEvent,
    processStripeV2AccountEvent,
} from "./provider-projections.ts";

type ApplyStripeDispute = (
    provider: StripeDispute,
    eventId: string,
    eventType?: string,
    eventCreatedAt?: string | null,
) => Promise<void>;

type StripeEventProcessorDependencies = {
    applyStripeDispute: ApplyStripeDispute;
    applyStripeRefund: ApplyStripeRefund;
    reconcilePayment(payment: ConnectPaymentRow): Promise<ConnectPaymentRow>;
};

export function createStripeEventProcessor({
    applyStripeDispute,
    applyStripeRefund,
    reconcilePayment,
}: StripeEventProcessorDependencies): (row: JsonRecord) => Promise<boolean> {
    return async function processStripeEvent(row) {
        const event = row.payload;
        if (!isRecord(event)) {
            throw new Error("stored Stripe event payload is invalid");
        }
        const eventType = stringAt(event, "type");
        const apiVersion = stringAt(event, "api_version");
        const expectedApiVersion = eventType.startsWith("v2.") ? stripeV2ApiVersion : stripeV1ApiVersion;
        if (apiVersion && apiVersion !== expectedApiVersion) {
            throw new Error(`Stripe webhook API version mismatch: ${apiVersion}`);
        }
        const eventId = stringAt(event, "id");
        const object = objectAt(objectAt(event, "data"), "object");
        const objectId = stringAt(object, "id") || stringAt(row, "object_id");

        if (eventType.startsWith("v2.core.account")) {
            return await processStripeV2AccountEvent(objectId);
        }

        if (eventType.startsWith("payment_intent.")) {
            if (!objectId) {
                throw new Error("Stripe PaymentIntent event has no object id");
            }
            const payment = await getRowByField<ConnectPaymentRow>(
                "payments",
                "stripe_payment_intent_id",
                objectId,
                paymentSelect,
            );
            if (!payment) {
                return false;
            }
            const intent = await retrievePaymentIntent(objectId);
            const applied = await applyPaymentIntent(payment, intent, {
                actorKind: "webhook",
                actorId: eventId,
            });
            await updatePayment(applied.id, {
                last_stripe_event_id: eventId,
            });
            await insertPaymentEvent(payment.id, `stripe_${eventType}`, "webhook", eventId, { objectId });
            return true;
        }

        if (eventType === "charge.succeeded" || eventType === "charge.failed") {
            const paymentIntentId = typeof object.payment_intent === "string" ? object.payment_intent : "";
            const payment = paymentIntentId
                ? await getRowByField<ConnectPaymentRow>(
                      "payments",
                      "stripe_payment_intent_id",
                      paymentIntentId,
                      paymentSelect,
                  )
                : objectId
                  ? await getRowByField<ConnectPaymentRow>("payments", "stripe_charge_id", objectId, paymentSelect)
                  : null;
            if (!payment) {
                return false;
            }
            const providerPaymentIntentId = paymentIntentId || payment.stripe_payment_intent_id;
            const providerIntent = providerPaymentIntentId
                ? await retrievePaymentIntent(providerPaymentIntentId)
                : null;
            const applied = !providerIntent
                ? await quarantineProviderPaymentTruth(
                      payment,
                      { id: "missing", status: "succeeded", latest_charge: object },
                      ["charge_payment_intent"],
                      { actorKind: "webhook", actorId: eventId },
                  )
                : eventType === "charge.succeeded" && objectId !== chargeId(providerIntent)
                  ? await quarantineProviderPaymentTruth(payment, providerIntent, ["charge_event_id"], {
                        actorKind: "webhook",
                        actorId: eventId,
                    })
                  : await applyPaymentIntent(payment, providerIntent, {
                        actorKind: "webhook",
                        actorId: eventId,
                    });
            await updatePayment(applied.id, {
                last_stripe_event_id: eventId,
                last_provider_sync_at: new Date().toISOString(),
            });
            return true;
        }

        if (eventType.startsWith("refund.") || eventType === "charge.refunded") {
            const refundId = eventType.startsWith("refund.") ? objectId : "";
            if (refundId) {
                const refund = await getRowByField<RefundRow>("refunds", "stripe_refund_id", refundId, refundSelect);
                if (!refund) {
                    return false;
                }
                const provider = await retrieveStripeRefundSnapshot(refundId);
                await applyStripeRefund(refund, provider);
                await updatePayment(refund.payment_id, { last_stripe_event_id: eventId });
                return true;
            }
            const chargeId = objectId;
            const payment = chargeId
                ? await getRowByField<ConnectPaymentRow>("payments", "stripe_charge_id", chargeId, paymentSelect)
                : null;
            if (!payment) {
                return false;
            }
            await reconcilePayment(payment);
            await updatePayment(payment.id, { last_stripe_event_id: eventId });
            return true;
        }

        if (eventType.startsWith("charge.dispute.")) {
            if (!objectId) {
                throw new Error("Stripe dispute event has no object id");
            }
            const provider = await retrieveStripeDispute(objectId);
            await applyStripeDispute(provider, eventId, eventType, stringAt(row, "provider_created_at") || null);
            return true;
        }

        if (eventType.startsWith("transfer.")) {
            return await processStripeTransferEvent(object, objectId, eventId);
        }

        if (eventType === "account.updated") {
            return await processStripeAccountUpdatedEvent(objectId);
        }

        if (eventType.startsWith("payout.")) {
            return await processStripePayoutEvent(event, eventType, object, objectId);
        }

        return false;
    };
}
