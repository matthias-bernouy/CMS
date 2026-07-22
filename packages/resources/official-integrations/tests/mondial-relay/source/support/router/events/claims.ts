import { jsonResponse } from "../../responses.ts";
import type { JsonRecord } from "../../runtime.ts";
import { supabaseUrl } from "../../runtime.ts";
import type { RouterContext } from "../types.ts";

export function handleEventClaims(context: RouterContext): Response | undefined {
    const { method, requestBody, state, url } = context;
    const { shipmentEvents } = state;
    if (
        url.origin === supabaseUrl &&
        url.pathname === "/rest/v1/rpc/claim_pending_shipment_events" &&
        method === "POST"
    ) {
        const body = JSON.parse(requestBody) as JsonRecord;
        const workerId = String(body.p_worker_id ?? "");
        const limit = Number(body.p_limit ?? 12);
        for (const row of shipmentEvents.filter(
            (item) => item.projection_status === "processing" && item.projection_claimed_at === "stale",
        )) {
            const manual = Number(row.projection_attempts ?? 0) >= Number(body.p_max_attempts ?? 5);
            Object.assign(row, {
                projection_status: manual ? "manual_review" : "retry_wait",
                projection_claimed_at: null,
                projection_claimed_by: null,
                projection_claim_token: null,
                projection_last_error: "projection lease expired before acknowledgement",
                projection_manual_review_at: manual ? "2026-07-12T11:32:00.000Z" : null,
            });
        }
        const claimed = shipmentEvents
            .filter(
                (row) =>
                    Boolean(row.normalized_status) &&
                    !row.commerce_projected_at &&
                    ["pending", "retry_wait"].includes(String(row.projection_status)),
            )
            .slice(0, limit);
        for (const row of claimed) {
            Object.assign(row, {
                projection_status: "processing",
                projection_attempts: Number(row.projection_attempts ?? 0) + 1,
                projection_claimed_at: "2026-07-12T11:32:00.000Z",
                projection_claimed_by: workerId,
                projection_claim_token: `00000000-0000-4000-8000-${String(row.id).padStart(6, "0")}${String(Number(row.projection_attempts ?? 0) + 1).padStart(6, "0")}`,
                projection_last_error: null,
            });
        }
        return jsonResponse(claimed, 200);
    }
    if (
        url.origin === supabaseUrl &&
        url.pathname === "/rest/v1/rpc/complete_shipment_event_projection" &&
        method === "POST"
    ) {
        const body = JSON.parse(requestBody) as JsonRecord;
        const row = shipmentEvents.find(
            (item) =>
                item.id === body.p_event_id &&
                item.projection_claim_token === body.p_claim_token &&
                item.projection_status === "processing",
        );
        if (!row) {
            return jsonResponse(false, 200);
        }
        Object.assign(row, {
            commerce_projected_at: "2026-07-12T11:33:00.000Z",
            projection_status: "projected",
            projection_claimed_at: null,
            projection_claimed_by: null,
            projection_claim_token: null,
            projection_last_error: null,
        });
        return jsonResponse(true, 200);
    }
    if (
        url.origin === supabaseUrl &&
        url.pathname === "/rest/v1/rpc/fail_shipment_event_projection" &&
        method === "POST"
    ) {
        const body = JSON.parse(requestBody) as JsonRecord;
        const row = shipmentEvents.find(
            (item) =>
                item.id === body.p_event_id &&
                item.projection_claim_token === body.p_claim_token &&
                item.projection_status === "processing",
        );
        if (!row) {
            return jsonResponse({ message: "projection lease mismatch" }, 409);
        }
        const manual = Number(row.projection_attempts) >= Number(body.p_max_attempts ?? 5);
        Object.assign(row, {
            projection_status: manual ? "manual_review" : "retry_wait",
            projection_next_attempt_at: "2026-07-12T11:34:00.000Z",
            projection_claimed_at: null,
            projection_claimed_by: null,
            projection_claim_token: null,
            projection_last_error: body.p_error,
            projection_manual_review_at: manual ? "2026-07-12T11:33:00.000Z" : null,
        });
        return jsonResponse(row, 200);
    }
    if (
        url.origin === supabaseUrl &&
        url.pathname === "/rest/v1/rpc/review_shipment_event_projection" &&
        method === "POST"
    ) {
        const body = JSON.parse(requestBody) as JsonRecord;
        const row = shipmentEvents.find((item) => item.id === body.p_event_id);
        if (!row) {
            return jsonResponse({ message: "not_found: shipment event" }, 404);
        }
        if (row.projection_status !== "manual_review") {
            return jsonResponse({ message: "conflict: only a manual-review projection can be reviewed" }, 409);
        }
        if (body.p_action !== "requeue") {
            return jsonResponse({ message: "conflict: no safely projected duplicate exists" }, 409);
        }
        Object.assign(row, {
            projection_status: "retry_wait",
            projection_attempts: 0,
            projection_next_attempt_at: "2026-07-12T11:35:00.000Z",
            projection_claimed_at: null,
            projection_claimed_by: null,
            projection_claim_token: null,
            projection_last_error: `operator requeue: ${String(body.p_reason)}`,
            projection_manual_review_at: null,
        });
        return jsonResponse(row, 200);
    }
    return undefined;
}
