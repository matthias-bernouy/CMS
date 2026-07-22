import { callRpcObject } from "../../db/postgrest.ts";
import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import { paymentStatusFromStripe } from "../../domain/payments/provider-state.ts";
import { HttpError } from "../../http/errors.ts";
import { hydrateSucceededPaymentIntentProviderTruth, retrievePaymentIntent } from "../../provider/payments.ts";
import type { ProviderTruthActorKind, StripePaymentIntent } from "../../provider/types.ts";
import { isRecord } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { buildAppliedPaymentProjection, buildQuarantinePaymentProjection } from "./projection-builders.ts";
import { providerPaymentTruthMismatches } from "./provider-truth.ts";

type ProjectionOptions = {
    expectedPaymentIntentId?: string;
    actorKind: ProviderTruthActorKind;
    actorId: string;
};

type PaymentProjectionResult = {
    payment: ConnectPaymentRow;
    intent: StripePaymentIntent | null;
    kind: "apply" | "quarantine" | null;
};

export async function syncPayment(payment: ConnectPaymentRow): Promise<ConnectPaymentRow> {
    return (await syncPaymentProjection(payment)).payment;
}

export async function syncPaymentWithClientSecret(
    payment: ConnectPaymentRow,
): Promise<{ payment: ConnectPaymentRow; clientSecret: string }> {
    const result = await syncPaymentProjection(payment);
    const canReuseProjectedIntent =
        result.kind === "apply" &&
        result.intent !== null &&
        result.intent.id === result.payment.stripe_payment_intent_id;
    return {
        payment: result.payment,
        clientSecret: canReuseProjectedIntent
            ? (result.intent?.client_secret ?? "")
            : await paymentClientSecret(result.payment),
    };
}

export async function applyPaymentIntent(
    payment: ConnectPaymentRow,
    intent: StripePaymentIntent,
    options: ProjectionOptions,
): Promise<ConnectPaymentRow> {
    return (await projectPaymentIntent(payment, intent, options)).payment;
}

export async function quarantineProviderPaymentTruth(
    payment: ConnectPaymentRow,
    intent: StripePaymentIntent,
    mismatches: string[],
    options: ProjectionOptions,
): Promise<ConnectPaymentRow> {
    return (await projectPaymentIntent(payment, intent, options, mismatches)).payment;
}

export async function paymentClientSecret(payment: ConnectPaymentRow): Promise<string> {
    if (!payment.stripe_payment_intent_id) {
        return "";
    }
    const intent = await retrievePaymentIntent(payment.stripe_payment_intent_id);
    return intent.client_secret ?? "";
}

async function projectPaymentIntent(
    payment: ConnectPaymentRow,
    intent: StripePaymentIntent,
    options: ProjectionOptions,
    forcedMismatches?: string[],
): Promise<PaymentProjectionResult> {
    while (true) {
        // Provider calls deliberately remain outside the atomic database RPC.
        // Only a cancellation which won while Stripe was in flight requires a
        // fresh provider read, matching the historical race handling.
        if (!forcedMismatches && payment.payment_status === "cancelled" && intent.status !== "canceled") {
            intent = await retrievePaymentIntent(payment.stripe_payment_intent_id ?? intent.id);
        }
        const paymentStatus = paymentStatusFromStripe(intent);
        const expectedPaymentIntentId = payment.stripe_payment_intent_id ?? options.expectedPaymentIntentId;
        if (!forcedMismatches && paymentStatus === "succeeded") {
            intent = await hydrateSucceededPaymentIntentProviderTruth(intent);
        }
        const mismatches =
            forcedMismatches ??
            (paymentStatus === "succeeded"
                ? providerPaymentTruthMismatches(payment, intent, expectedPaymentIntentId)
                : []);
        const kind = mismatches.length ? "quarantine" : "apply";
        const projection =
            kind === "quarantine"
                ? await buildQuarantinePaymentProjection(payment, intent, mismatches, options)
                : await buildAppliedPaymentProjection(payment, intent, paymentStatus, expectedPaymentIntentId, options);
        const result = await callRpcObject<JsonRecord>("apply_payment_provider_projection", {
            p_payment_id: payment.id,
            p_expected_payment: payment,
            p_projection: projection,
        });
        if (typeof result.applied !== "boolean" || !isRecord(result.payment)) {
            throw new HttpError(502, "payment provider projection returned an invalid response");
        }
        payment = result.payment as ConnectPaymentRow;
        if (result.applied) {
            return { payment, intent, kind };
        }
    }
}

async function syncPaymentProjection(payment: ConnectPaymentRow): Promise<PaymentProjectionResult> {
    if (!payment.stripe_payment_intent_id) {
        return { payment, intent: null, kind: null };
    }
    const intent = await retrievePaymentIntent(payment.stripe_payment_intent_id);
    return await projectPaymentIntent(payment, intent, {
        actorKind: "reconciliation",
        actorId: "provider-sync",
    });
}
