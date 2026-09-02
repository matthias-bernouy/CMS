import { jsonResponse } from "../../../http";
import { same } from "../../../records";
import type { JsonRecord } from "../../../types";
import type { StripeConnectMock } from "../../stripe-connect";

export async function handleProjectionEnqueueRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
    table: string,
): Promise<Response | null> {
    if (table === "rpc/enqueue_commerce_provider_projection" && method === "POST") {
        if (mock.failPaymentProjectionEnqueue) {
            mock.failPaymentProjectionEnqueue = false;
            return jsonResponse({ message: "simulated payment projection enqueue failure" }, 500);
        }
        const body = JSON.parse(await request.text()) as JsonRecord;
        let projection = mock.tables.commerce_projection_outbox.find(
            (row) => row.projection_key === body.p_projection_key,
        );
        if (!projection) {
            projection = mock.insertGeneric("commerce_projection_outbox", {
                operation_id: null,
                payment_id: body.p_payment_id,
                projection_key: body.p_projection_key,
                projection_kind: body.p_projection_kind,
                provider_object_id: body.p_provider_object_id,
                projection_payload: {},
                recovery_key: null,
                causal_sequence: 0,
                projection_status: "pending",
                attempt_count: 0,
                next_attempt_at: null,
                claim_owner: null,
                claim_token: null,
                claimed_at: null,
                last_error: null,
                projected_at: null,
                intervention_revision: 0,
                last_intervention_at: null,
                last_intervention_by: null,
                last_intervention_reason: null,
            });
        }
        if (mock.losePaymentProjectionEnqueueResponse) {
            mock.losePaymentProjectionEnqueueResponse = false;
            throw new Error("simulated lost payment projection response");
        }
        return jsonResponse(projection);
    }
    if (table === "rpc/enqueue_commerce_refund_projection" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const refund = mock.tables.refunds.find((row) => same(row.id, body.p_refund_id));
        if (!refund) {
            return jsonResponse({ message: "not_found: refund" }, 400);
        }
        const projectionKey = `refund:${refund.id}:${refund.status}`;
        let projection = mock.tables.commerce_projection_outbox.find((row) => row.projection_key === projectionKey);
        if (!projection) {
            projection = mock.insertGeneric("commerce_projection_outbox", {
                operation_id: refund.operation_id,
                payment_id: refund.payment_id,
                projection_key: projectionKey,
                projection_kind: "refund",
                provider_object_id: refund.stripe_refund_id ?? String(refund.id),
                projection_payload: {
                    refundId: refund.id,
                    refundRequestId: refund.refund_request_id,
                    commerceRefundRequestId: refund.commerce_refund_request_id,
                    stripeRefundId: refund.stripe_refund_id,
                    status: refund.status,
                    failureReason: refund.failure_reason,
                    providerSnapshot: refund.provider_snapshot ?? {},
                    occurredAt: refund.updated_at,
                },
                recovery_key:
                    Number(refund.required_reversal_amount) > 0 ? `${refund.refund_request_id}:seller-recovery` : null,
                causal_sequence: refund.status === "pending" ? 10 : 20,
                projection_status: "pending",
                attempt_count: 0,
                next_attempt_at: null,
                claim_owner: null,
                claim_token: null,
                claimed_at: null,
                last_error: null,
                projected_at: null,
                intervention_revision: 0,
                last_intervention_at: null,
                last_intervention_by: null,
                last_intervention_reason: null,
            });
        }
        return jsonResponse(projection);
    }
    return null;
}
