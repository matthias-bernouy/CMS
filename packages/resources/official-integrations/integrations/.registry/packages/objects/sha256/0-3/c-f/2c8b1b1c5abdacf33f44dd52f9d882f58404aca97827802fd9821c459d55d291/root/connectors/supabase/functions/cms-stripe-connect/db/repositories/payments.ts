import { isRecord, stripUndefined } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { firstRow, rest, restError } from "../postgrest.ts";
import { paymentSelect, type ConnectPaymentRow } from "../records/payments.ts";

export async function reserveProtectedPayment(values: JsonRecord): Promise<ConnectPaymentRow> {
    const response = await rest("rpc/reserve_protected_payment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ p_payment: stripUndefined(values) }),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    const value = await response.json();
    if (isRecord(value)) {
        return value as ConnectPaymentRow;
    }
    return firstRow<ConnectPaymentRow>(value);
}

export async function reservePaymentCancellationIntent(
    clientReferenceId: string,
    cancellationRequestId: string,
    reason: string | undefined,
): Promise<JsonRecord> {
    const response = await rest("rpc/reserve_payment_cancellation_intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_client_reference_id: clientReferenceId,
            p_cancellation_request_id: cancellationRequestId,
            p_reason: reason ?? null,
        }),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    const value = await response.json();
    return isRecord(value) ? value : firstRow<JsonRecord>(value);
}

export async function updatePayment(paymentId: number, values: JsonRecord): Promise<ConnectPaymentRow | null> {
    const response = await rest(`payments?id=eq.${paymentId}&select=${paymentSelect}`, {
        method: "PATCH",
        headers: {
            "content-type": "application/json",
            prefer: "return=representation",
        },
        body: JSON.stringify(stripUndefined(values)),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    const rows = (await response.json()) as ConnectPaymentRow[];
    return rows[0] ?? null;
}

export async function getPaymentRow(paymentId: number): Promise<ConnectPaymentRow | null> {
    const response = await rest(`payments?id=eq.${paymentId}&select=${paymentSelect}&limit=1`, { method: "GET" });
    if (!response.ok) {
        throw await restError(response);
    }
    const rows = (await response.json()) as ConnectPaymentRow[];
    return rows[0] ?? null;
}

export async function getPaymentByClientReference(clientReferenceId: string): Promise<ConnectPaymentRow | null> {
    const response = await rest(
        `payments?client_reference_id=eq.${encodeURIComponent(clientReferenceId)}&select=${paymentSelect}&limit=1`,
        { method: "GET" },
    );
    if (!response.ok) {
        throw await restError(response);
    }
    const rows = (await response.json()) as ConnectPaymentRow[];
    return rows[0] ?? null;
}
