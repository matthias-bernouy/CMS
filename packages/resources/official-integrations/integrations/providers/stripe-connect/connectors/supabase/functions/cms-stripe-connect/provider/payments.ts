import type { ConnectPaymentRow } from "../db/records/payments.ts";
import { stableStripeIdempotencyKey } from "../shared/crypto.ts";
import { isRecord } from "../shared/data.ts";
import type { JsonRecord } from "../shared/types.ts";
import { stripeV1 } from "./stripe-client.ts";
import type { StripePaymentIntent } from "./types.ts";

export async function createStripePaymentIntent(payment: ConnectPaymentRow): Promise<StripePaymentIntent> {
    const params = new URLSearchParams();
    params.set("amount", String(payment.amount_total));
    params.set("currency", payment.currency);
    params.append("payment_method_types[]", "card");
    params.set("transfer_group", payment.transfer_group);
    params.set("metadata[cms_payment_id]", String(payment.id));
    params.set("metadata[client_reference_id]", payment.client_reference_id);
    params.set("metadata[financial_terms_hash]", payment.financial_terms_hash);
    params.set("metadata[seller_cms_user_id]", payment.seller_cms_user_id);
    params.set("expand[]", "latest_charge.balance_transaction");
    if (payment.description) {
        params.set("description", payment.description);
    }

    return await stripeV1<StripePaymentIntent>(
        "/payment_intents",
        {
            method: "POST",
            body: params,
        },
        { idempotencyKey: `payment:${payment.id}:${payment.financial_terms_hash}` },
    );
}

export async function retrievePaymentIntent(paymentIntentId: string): Promise<StripePaymentIntent> {
    const params = new URLSearchParams();
    params.set("expand[]", "latest_charge.balance_transaction");
    return await stripeV1<StripePaymentIntent>(
        `/payment_intents/${encodeURIComponent(paymentIntentId)}?${params.toString()}`,
        { method: "GET" },
    );
}

export async function hydrateSucceededPaymentIntentProviderTruth(
    intent: StripePaymentIntent,
): Promise<StripePaymentIntent> {
    let charge: string | JsonRecord | null | undefined = intent.latest_charge;
    if (typeof charge === "string") {
        charge = await retrieveStripeCharge(charge);
    }
    if (!isRecord(charge)) {
        return intent;
    }

    let balanceTransaction = charge.balance_transaction;
    if (typeof balanceTransaction === "string") {
        balanceTransaction = await retrieveStripeBalanceTransaction(balanceTransaction);
    }
    if (balanceTransaction === charge.balance_transaction && charge === intent.latest_charge) {
        return intent;
    }
    return {
        ...intent,
        latest_charge: {
            ...charge,
            balance_transaction: balanceTransaction,
        },
    };
}

async function retrieveStripeCharge(chargeId: string): Promise<JsonRecord> {
    const params = new URLSearchParams();
    params.set("expand[]", "balance_transaction");
    return await stripeV1<JsonRecord>(`/charges/${encodeURIComponent(chargeId)}?${params.toString()}`, {
        method: "GET",
    });
}

export async function retrieveStripeBalanceTransaction(balanceTransactionId: string): Promise<JsonRecord> {
    return await stripeV1<JsonRecord>(`/balance_transactions/${encodeURIComponent(balanceTransactionId)}`, {
        method: "GET",
    });
}

export async function cancelStripePaymentIntent(paymentIntentId: string): Promise<StripePaymentIntent> {
    const params = new URLSearchParams();
    params.set("cancellation_reason", "requested_by_customer");
    params.set("expand[]", "latest_charge.balance_transaction");
    return await stripeV1<StripePaymentIntent>(
        `/payment_intents/${encodeURIComponent(paymentIntentId)}/cancel`,
        { method: "POST", body: params },
        { idempotencyKey: await stableStripeIdempotencyKey("payment-cancel", paymentIntentId) },
    );
}
