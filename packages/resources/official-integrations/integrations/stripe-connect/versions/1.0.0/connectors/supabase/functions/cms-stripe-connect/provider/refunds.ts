import type { JsonRecord } from "../shared/types.ts";
import { stripeV1 } from "./stripe-client.ts";
import type { StripeRefund } from "./types.ts";

export async function createStripeRefund(
    chargeId: string,
    amount: number,
    refundRequestId: string,
    reason: string | null,
    idempotencyKey: string,
): Promise<StripeRefund> {
    const params = new URLSearchParams();
    params.set("charge", chargeId);
    params.set("amount", String(amount));
    params.set("metadata[refund_request_id]", refundRequestId);
    params.set("expand[]", "balance_transaction");
    if (reason) {
        params.set("metadata[commerce_reason]", reason);
    }
    return await stripeV1<StripeRefund>("/refunds", { method: "POST", body: params }, { idempotencyKey });
}

export async function retrieveStripeRefund(refundId: string): Promise<StripeRefund> {
    return await stripeV1<StripeRefund>(`/refunds/${encodeURIComponent(refundId)}?expand[]=balance_transaction`, {
        method: "GET",
    });
}

export async function retrieveStripeRefundSnapshot(refundId: string): Promise<StripeRefund> {
    return await stripeV1<StripeRefund>(`/refunds/${encodeURIComponent(refundId)}`, { method: "GET" });
}

export async function listStripeRefundsByCharge(
    chargeId: string,
    expandBalanceTransaction = false,
): Promise<JsonRecord> {
    const params = new URLSearchParams({ charge: chargeId, limit: "100" });
    if (expandBalanceTransaction) {
        params.set("expand[]", "data.balance_transaction");
    }
    return await stripeV1<JsonRecord>(`/refunds?${params.toString()}`, { method: "GET" });
}
