import { jsonResponse } from "../../responses.ts";
import type { JsonRecord } from "../../runtime.ts";
import { supabaseUrl } from "../../runtime.ts";
import type { RouterContext } from "../types.ts";

export function handleShipmentCancellation(context: RouterContext): Response | undefined {
    const { method, requestBody, state, url } = context;
    const { insertedShipments, labelAccessTokens } = state;
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/rpc/declare_seller_handoff" && method === "POST") {
        const body = JSON.parse(requestBody) as JsonRecord;
        const actor = String(body.p_seller_cms_user_id ?? "").trim();
        if (!actor) {
            return jsonResponse(
                {
                    message: "validation: seller CMS user id is required",
                },
                400,
            );
        }
        const row = insertedShipments.find(
            (item) => item.external_order_id === body.p_external_order_id && item.seller_cms_user_id === actor,
        );
        if (!row) {
            return jsonResponse(
                {
                    message: "not_found: shipment not found",
                },
                404,
            );
        }
        if (!row.seller_handoff_declared_at) {
            if (row.carrier_accepted_at || row.status !== "label_ready") {
                return jsonResponse(
                    {
                        message: "conflict: seller handoff cannot be declared for the current shipment state",
                    },
                    409,
                );
            }
            row.seller_handoff_declared_at = new Date().toISOString();
        }
        return jsonResponse(
            {
                id: row.id,
                external_order_id: row.external_order_id,
                expedition_number: row.expedition_number,
                status: row.status,
                carrier_accepted_at: row.carrier_accepted_at,
                recipient_handoff_at: row.recipient_handoff_at,
                seller_handoff_declared_at: row.seller_handoff_declared_at,
            },
            200,
        );
    }
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/rpc/cancel_shipment_unscanned" && method === "POST") {
        const body = JSON.parse(requestBody) as JsonRecord;
        const row = insertedShipments.find((item) => item.external_order_id === body.p_external_order_id);
        if (!row) {
            return jsonResponse({ message: "not_found: shipment" }, 404);
        }
        if (["cancelled_unscanned", "cancelled"].includes(String(row.status))) {
            if (String(body.p_tracking_until ?? "") !== String(row.cancellation_tracking_until ?? "")) {
                return jsonResponse({ message: "conflict: cancellation replay changed the tracking deadline" }, 409);
            }
            return jsonResponse({ ...row, idempotentReplay: true }, 200);
        }
        const trackingUntil = Date.parse(String(body.p_tracking_until ?? ""));
        if (!Number.isFinite(trackingUntil) || trackingUntil <= Date.now()) {
            return jsonResponse({ message: "validation: cancellation tracking deadline must be in the future" }, 400);
        }
        if (row.tracking_claimed_at && Date.parse(String(row.tracking_claimed_at)) > Date.now() - 20 * 60_000) {
            return jsonResponse({ message: "conflict: active carrier reconciliation prevents cancellation" }, 409);
        }
        if (
            row.seller_handoff_declared_at ||
            row.carrier_accepted_at ||
            !["created", "label_ready", "failed", "cancelled_unscanned", "cancelled"].includes(String(row.status))
        ) {
            return jsonResponse(
                { message: "conflict: shipment can no longer be cancelled before carrier reconciliation" },
                409,
            );
        }
        Object.assign(row, {
            status: "cancelled_unscanned",
            cancellation_tracking_until: body.p_tracking_until,
            tracking_next_attempt_at: "2026-07-12T11:00:00.000Z",
            tracking_claimed_at: null,
            tracking_claimed_by: null,
            last_error: null,
        });
        for (const token of labelAccessTokens.filter((item) => item.shipment_id === row.id && !item.revoked_at)) {
            token.revoked_at = "2026-07-12T11:00:00.000Z";
        }
        return jsonResponse({ ...row, idempotentReplay: false }, 200);
    }
    return undefined;
}
