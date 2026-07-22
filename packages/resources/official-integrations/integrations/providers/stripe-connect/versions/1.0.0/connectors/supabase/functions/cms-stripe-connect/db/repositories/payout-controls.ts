import type { JsonRecord } from "../../shared/types.ts";
import { rest, restError } from "../postgrest.ts";

export async function markPaymentManualReview(paymentId: number, reason: string, details: JsonRecord): Promise<void> {
    const response = await rest("rpc/mark_payment_manual_review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ p_payment_id: paymentId, p_reason: reason, p_details: details }),
    });
    if (!response.ok) {
        throw await restError(response);
    }
}

export async function sellerPayoutHoldRpc(name: string, body: JsonRecord): Promise<JsonRecord> {
    const response = await rest(`rpc/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    return (await response.json()) as JsonRecord;
}

export async function platformPayoutControlRpc(name: string, body: JsonRecord): Promise<JsonRecord> {
    const response = await rest(`rpc/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    return (await response.json()) as JsonRecord;
}
