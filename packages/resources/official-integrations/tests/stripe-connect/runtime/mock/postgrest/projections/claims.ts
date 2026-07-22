import { jsonResponse } from "../../../http";
import type { JsonRecord } from "../../../types";
import type { StripeConnectMock } from "../../stripe-connect";

export async function handleProjectionClaimRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
    table: string,
): Promise<Response | null> {
    if (table === "rpc/claim_stripe_events" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const limit = Number(body.p_limit ?? 50);
        const claimed = mock.tables.stripe_events
            .filter(
                (row) =>
                    ["pending", "failed"].includes(String(row.processing_status ?? "pending")) ||
                    (row.processing_status === "processing" &&
                        Date.parse(String(row.processing_started_at ?? "")) <= Date.now() - 5 * 60_000),
            )
            .slice(0, limit)
            .map((row) =>
                mock.update(row, {
                    processing_status: "processing",
                    processing_started_at: new Date().toISOString(),
                    attempt_count: Number(row.attempt_count ?? 0) + 1,
                    last_error: null,
                }),
            );
        return jsonResponse(claimed);
    }
    if (table === "rpc/claim_financial_operations" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const limit = Number(body.p_limit ?? 50);
        const claimed = mock.tables.financial_operations
            .filter(
                (row) =>
                    [
                        "payment_intent_create",
                        "payment_intent_cancel",
                        "transfer_create",
                        "transfer_reversal_create",
                        "refund_create",
                        "payout_schedule_update",
                    ].includes(String(row.operation_type)) &&
                    ["reserved", "processing", "failed"].includes(String(row.status)),
            )
            .slice(0, limit)
            .map((row) =>
                mock.update(row, {
                    status: "processing",
                    claimed_at: new Date().toISOString(),
                    attempt_count: Number(row.attempt_count ?? 0) + 1,
                    last_error: null,
                }),
            );
        return jsonResponse(claimed);
    }
    return null;
}
