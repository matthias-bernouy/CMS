import { jsonResponse } from "../../../http";
import type { JsonRecord } from "../../../types";
import type { StripeConnectMock } from "../../stripe-connect";

export async function handlePaymentCancellationRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
    table: string,
): Promise<Response | null> {
    if (table === "rpc/reserve_payment_cancellation_intent" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const reference = String(body.p_client_reference_id);
        const cancellationRequestId = String(body.p_cancellation_request_id);
        const reason =
            typeof body.p_reason === "string" && body.p_reason.trim()
                ? body.p_reason.trim()
                : "Commerce requested provider payment cancellation";
        const payment = mock.tables.payments.find((row) => row.client_reference_id === reference);
        let guard = mock.tables.payment_lifecycle_guards.find((row) => row.client_reference_id === reference);
        if (
            guard?.cancellation_request_id &&
            (guard.cancellation_request_id !== cancellationRequestId || guard.cancellation_reason !== reason)
        ) {
            return jsonResponse({ message: "conflict: payment cancellation intent replay mismatch" }, 400);
        }
        if (!guard) {
            guard = mock.insertGeneric("payment_lifecycle_guards", {
                client_reference_id: reference,
                payment_id: payment?.id ?? null,
                cancellation_request_id: cancellationRequestId,
                cancellation_reason: reason,
                cancellation_requested_at: "2026-07-06T12:04:00.000Z",
                payment_linked_at: payment?.created_at ?? null,
            });
        } else if (!guard.cancellation_request_id) {
            guard = mock.update(guard, {
                cancellation_request_id: cancellationRequestId,
                cancellation_reason: reason,
                cancellation_requested_at: "2026-07-06T12:04:00.000Z",
            });
        }
        return jsonResponse({
            clientReferenceId: reference,
            cancellationRequestId,
            paymentId: guard.payment_id,
            providerPaymentAbsent: guard.payment_id === null || guard.payment_id === undefined,
            requestedAt: guard.cancellation_requested_at,
        });
    }
    return null;
}
