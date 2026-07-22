import { expect } from "bun:test";
import { financialTermsHash } from "../../constants";
import { jsonResponse } from "../../http";
import type { JsonRecord } from "../../types";
import type { StripeConnectMock } from "../stripe-connect";

export async function handleStripePaymentRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
): Promise<Response | null> {
    if (url.pathname === "/v1/files" && method === "POST") {
        expect(request.headers.get("content-type")).toStartWith("multipart/form-data; boundary=");
        const upload = mock.fileUploadRequests.at(-1);
        if (!upload) {
            throw new Error("Stripe file upload form data was not captured");
        }
        if (mock.failDisputeFileUpload) {
            mock.failDisputeFileUpload = false;
            return jsonResponse({ error: { message: "simulated Stripe dispute file upload failure" } }, 503);
        }
        return jsonResponse({ id: "file_dispute_1", filename: upload.fileName, purpose: upload.purpose });
    }
    if (url.pathname === "/v1/payment_intents" && method === "POST") {
        const params = new URLSearchParams(await request.text());
        if (mock.failNextPaymentIntentCreation) {
            mock.failNextPaymentIntentCreation = false;
            return jsonResponse({ error: { message: "simulated Stripe PaymentIntent creation failure" } }, 503);
        }
        mock.paymentIntentCreateCount += 1;
        mock.lastPaymentIntentParameters = params;
        expect(params.getAll("payment_method_types[]")).toEqual(["card"]);
        expect(params.has("automatic_payment_methods[enabled]")).toBeFalse();
        expect(params.has("transfer_data[destination]")).toBeFalse();
        expect(params.has("application_fee_amount")).toBeFalse();
        expect(params.has("on_behalf_of")).toBeFalse();
        expect(params.get("metadata[financial_terms_hash]")).toBe(financialTermsHash);
        expect(params.getAll("expand[]")).toEqual(["latest_charge.balance_transaction"]);
        const id = `pi_${mock.nextIntentId++}`;
        const intent: JsonRecord = {
            id,
            client_secret: `${id}_secret`,
            status: "requires_payment_method",
            amount: Number(params.get("amount")),
            amount_received: 0,
            currency: params.get("currency"),
            transfer_group: params.get("transfer_group"),
            metadata: {
                cms_payment_id: params.get("metadata[cms_payment_id]"),
                client_reference_id: params.get("metadata[client_reference_id]"),
                financial_terms_hash: params.get("metadata[financial_terms_hash]"),
                seller_cms_user_id: params.get("metadata[seller_cms_user_id]"),
            },
            latest_charge: null,
        };
        if (mock.nextPaymentIntentProjectionManualReview) {
            mock.nextPaymentIntentProjectionManualReview = false;
            intent.status = "succeeded";
            intent.amount_received = intent.amount;
        }
        mock.paymentIntents.set(id, intent);
        return jsonResponse(intent);
    }
    if (/^\/v1\/payment_intents\/pi_[^/]+\/cancel$/.test(url.pathname) && method === "POST") {
        const id = decodeURIComponent(url.pathname.slice("/v1/payment_intents/".length, -"/cancel".length));
        const params = new URLSearchParams(await request.text());
        expect(params.get("cancellation_reason")).toBe("requested_by_customer");
        expect(params.getAll("expand[]")).toEqual(["latest_charge.balance_transaction"]);
        expect(request.headers.get("idempotency-key")).toStartWith("cms:payment-cancel:");
        const intent = mock.paymentIntents.get(id);
        if (!intent) {
            return jsonResponse({ error: { message: "PaymentIntent not found" } }, 404);
        }
        if (mock.returnNextPaymentCancellationNonTerminal) {
            mock.returnNextPaymentCancellationNonTerminal = false;
            return jsonResponse(intent);
        }
        Object.assign(intent, { status: "canceled", canceled_at: Math.floor(Date.now() / 1000) });
        if (mock.loseNextPaymentCancellationResponse) {
            mock.loseNextPaymentCancellationResponse = false;
            throw new Error("simulated lost PaymentIntent cancellation response");
        }
        return jsonResponse(intent);
    }
    if (url.pathname.startsWith("/v1/payment_intents/") && method === "GET") {
        const id = decodeURIComponent(url.pathname.slice("/v1/payment_intents/".length));
        if (mock.failPaymentIntentRetrieve) {
            mock.failPaymentIntentRetrieve = false;
            return jsonResponse({ error: { message: "simulated Stripe provider outage" } }, 503);
        }
        const intent = mock.paymentIntents.get(id) ?? {
            id,
            status: "requires_payment_method",
            latest_charge: null,
        };
        const replacement = mock.paymentIntentReplacementOnNextRetrieve;
        if (replacement) {
            mock.paymentIntentReplacementOnNextRetrieve = null;
            mock.patchPaymentLedger(replacement.paymentId, {
                stripe_payment_intent_id: replacement.replacementId,
            });
        }
        return jsonResponse(intent);
    }
    if (/^\/v1\/charges\/ch_[^/]+$/.test(url.pathname) && method === "GET") {
        const id = decodeURIComponent(url.pathname.slice("/v1/charges/".length));
        mock.chargeRetrieveCount += 1;
        expect(url.searchParams.getAll("expand[]")).toEqual(["balance_transaction"]);
        const charge = mock.providerCharges.get(id);
        return charge ? jsonResponse(charge) : jsonResponse({ error: { message: "Charge not found" } }, 404);
    }
    if (/^\/v1\/balance_transactions\/txn_[^/]+$/.test(url.pathname) && method === "GET") {
        const id = decodeURIComponent(url.pathname.slice("/v1/balance_transactions/".length));
        mock.balanceTransactionRetrieveCount += 1;
        const transaction = mock.providerBalanceTransactions.get(id);
        return transaction
            ? jsonResponse(transaction)
            : jsonResponse({ error: { message: "BalanceTransaction not found" } }, 404);
    }
    return null;
}
