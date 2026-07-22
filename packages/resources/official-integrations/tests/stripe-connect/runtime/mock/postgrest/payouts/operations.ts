import { jsonResponse } from "../../../http";
import type { JsonRecord } from "../../../types";
import type { StripeConnectMock } from "../../stripe-connect";

export async function handlePayoutOperationRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
    table: string,
): Promise<Response | null> {
    if (table === "rpc/reserve_account_financial_operation" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const businessKey = String(body.p_business_key);
        const existing = mock.tables.financial_operations.find((row) => row.business_key === businessKey);
        if (existing) {
            if (JSON.stringify(existing.request) !== JSON.stringify(body.p_request)) {
                return jsonResponse({ message: "conflict: account financial operation replay mismatch" }, 400);
            }
            return jsonResponse(existing);
        }
        const now = "2026-07-06T12:04:00.000Z";
        const operation = {
            id: mock.nextRowId++,
            payment_id: null,
            business_key: businessKey,
            operation_type: body.p_operation_type,
            status: "reserved",
            stripe_object_id: null,
            request: body.p_request,
            response: null,
            last_error: null,
            attempt_count: 0,
            next_attempt_at: null,
            claimed_at: null,
            completed_at: null,
            created_at: now,
            updated_at: now,
        };
        mock.tables.financial_operations.push(operation);
        return jsonResponse(operation);
    }
    if (table === "rpc/reserve_platform_financial_operation" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const businessKey = String(body.p_business_key);
        const existing = mock.tables.financial_operations.find((row) => row.business_key === businessKey);
        if (existing) {
            return jsonResponse(existing);
        }
        const now = "2026-07-06T12:04:00.000Z";
        const operation = {
            id: mock.nextRowId++,
            payment_id: null,
            business_key: businessKey,
            operation_type: body.p_operation_type,
            status: "reserved",
            stripe_object_id: null,
            request: body.p_request,
            response: null,
            last_error: null,
            attempt_count: 0,
            next_attempt_at: null,
            claimed_at: null,
            completed_at: null,
            created_at: now,
            updated_at: now,
        };
        mock.tables.financial_operations.push(operation);
        return jsonResponse(operation);
    }
    return null;
}
