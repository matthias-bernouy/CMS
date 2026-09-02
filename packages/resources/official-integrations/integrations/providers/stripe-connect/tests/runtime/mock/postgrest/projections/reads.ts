import { jsonResponse } from "../../../http";
import { same } from "../../../records";
import type { JsonRecord } from "../../../types";
import type { StripeConnectMock } from "../../stripe-connect";

export async function handleProjectionReadRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
    table: string,
): Promise<Response | null> {
    if (table === "rpc/read_reconciliation_operations" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const limit = Number(body.p_limit ?? 50);
        const operations = [...mock.tables.financial_operations]
            .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))
            .slice(0, limit);
        return jsonResponse(
            operations.map((operation) => {
                const payment = mock.tables.payments.find((row) => same(row.id, operation.payment_id));
                return {
                    operation,
                    client_reference_id: payment?.client_reference_id ?? null,
                    payment_currency: payment?.currency ?? null,
                };
            }),
        );
    }
    if (table === "rpc/claim_commerce_projection_outbox" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        return jsonResponse(mock.claimCommerceProjectionOutbox(body));
    }
    if (table === "rpc/claim_reconciliation_projection_batch" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const claimed = mock.claimCommerceProjectionOutbox(body);
        return jsonResponse(
            claimed.map((projection) => {
                const payment = mock.tables.payments.find((row) => same(row.id, projection.payment_id)) ?? null;
                const operation =
                    mock.tables.financial_operations.find((row) => same(row.id, projection.operation_id)) ?? null;
                const operationPayment = operation
                    ? (mock.tables.payments.find((row) => same(row.id, operation.payment_id)) ?? null)
                    : null;
                const providerObjectId = String(projection.provider_object_id ?? "");
                const dispute =
                    projection.projection_kind === "dispute" && /^[1-9][0-9]*$/.test(providerObjectId)
                        ? (mock.tables.stripe_disputes.find((row) => same(row.id, providerObjectId)) ?? null)
                        : null;
                const disputePayment = dispute
                    ? (mock.tables.payments.find((row) => same(row.id, dispute.payment_id)) ?? null)
                    : null;
                const evidence = dispute
                    ? mock.tables.stripe_dispute_evidence
                          .filter((row) => same(row.dispute_id, dispute.id))
                          .sort((left, right) => String(right.staged_at).localeCompare(String(left.staged_at)))
                    : [];
                const pendingApproval = dispute
                    ? (mock.tables.irreversible_dispute_action_approvals
                          .filter((row) => same(row.dispute_id, dispute.id) && row.status === "pending_second_approval")
                          .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))[0] ??
                      null)
                    : null;
                const staged = evidence[0];
                return {
                    projection,
                    payment,
                    financial_operation: operation,
                    operation_payment: operationPayment,
                    dispute,
                    dispute_client_reference_id: disputePayment?.client_reference_id ?? null,
                    staged_evidence: staged
                        ? {
                              evidence_operation_id: staged.evidence_operation_id,
                              staged_at: staged.staged_at,
                              submitted_at: staged.submitted_at,
                          }
                        : null,
                    evidence_submission_count: evidence.filter((row) => row.submitted_at).length,
                    pending_approval: pendingApproval
                        ? {
                              action_type: pendingApproval.action_type,
                              status: pendingApproval.status,
                              first_actor_id: pendingApproval.first_actor_id,
                              first_approved_at: pendingApproval.first_approved_at,
                              second_actor_id: pendingApproval.second_actor_id,
                              second_approved_at: pendingApproval.second_approved_at,
                          }
                        : null,
                };
            }),
        );
    }
    return null;
}
