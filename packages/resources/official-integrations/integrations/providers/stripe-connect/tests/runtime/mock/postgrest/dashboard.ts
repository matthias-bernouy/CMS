import { jsonResponse } from "../../http";
import { same } from "../../records";
import type { JsonRecord } from "../../types";
import type { StripeConnectMock } from "../stripe-connect";

export async function handleDashboardRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
    table: string,
): Promise<Response | null> {
    if (table === "rpc/list_dashboard_refunds" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const rows = mock.dashboardPage("refunds", body, ["refund_request_id", "stripe_refund_id"]);
        return jsonResponse(
            rows.map((refund) => ({
                refund,
                client_reference_id: mock.requiredDashboardPayment(refund.payment_id).client_reference_id,
            })),
        );
    }
    if (table === "rpc/read_dashboard_disputes" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const rows = mock.dashboardPage(
            "stripe_disputes",
            body,
            ["stripe_dispute_id", "stripe_charge_id", "reason"],
            "stripe_dispute_id",
        );
        return jsonResponse(
            rows.map((dispute) => {
                const evidence = mock.tables.stripe_dispute_evidence.filter((row) => same(row.dispute_id, dispute.id));
                const pendingApproval = mock.tables.irreversible_dispute_action_approvals.find(
                    (row) => same(row.dispute_id, dispute.id) && row.status === "pending_second_approval",
                );
                return {
                    dispute,
                    client_reference_id: mock.requiredDashboardPayment(dispute.payment_id).client_reference_id,
                    staged_evidence: evidence[0] ?? null,
                    evidence_submission_count: evidence.filter((row) => row.submitted_at).length,
                    pending_approval: pendingApproval ?? null,
                };
            }),
        );
    }
    if (table === "rpc/list_dashboard_financial_operations" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const rows = mock.dashboardPage("financial_operations", body, [
            "business_key",
            "stripe_object_id",
            "last_error",
        ]);
        return jsonResponse(
            rows.map((operation) => {
                const payment = operation.payment_id ? mock.requiredDashboardPayment(operation.payment_id) : null;
                return {
                    operation,
                    client_reference_id: payment?.client_reference_id ?? null,
                    payment_currency: payment?.currency ?? null,
                };
            }),
        );
    }
    return null;
}
