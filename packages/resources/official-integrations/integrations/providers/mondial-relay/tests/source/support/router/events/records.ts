import { projectRows } from "../../projection.ts";
import { jsonResponse } from "../../responses.ts";
import type { JsonRecord } from "../../runtime.ts";
import { supabaseUrl } from "../../runtime.ts";
import type { RouterContext } from "../types.ts";

export function handleEventRecords(context: RouterContext): Response | undefined {
    const { method, requestBody, state, url } = context;
    const { shipmentEvents } = state;
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/shipment_events" && method === "GET") {
        const shipmentId = url.searchParams.get("shipment_id")?.replace(/^eq\./, "");
        const pendingOnly = url.searchParams.get("commerce_projected_at") === "is.null";
        const normalizedOnly = url.searchParams.get("normalized_status") === "not.is.null";
        const projectionStatuses = /^in\.\((.+)\)$/
            .exec(url.searchParams.get("projection_status") ?? "")?.[1]
            ?.split(",");
        return jsonResponse(
            projectRows(
                url,
                shipmentEvents.filter(
                    (row) =>
                        (!shipmentId || row.shipment_id === shipmentId) &&
                        (!pendingOnly || !row.commerce_projected_at) &&
                        (!normalizedOnly || Boolean(row.normalized_status)) &&
                        (!projectionStatuses || projectionStatuses.includes(String(row.projection_status))),
                ),
            ),
            200,
        );
    }
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/shipment_events" && method === "POST") {
        const rows = JSON.parse(requestBody) as JsonRecord[];
        for (const row of rows) {
            const index = shipmentEvents.findIndex(
                (item) => item.shipment_id === row.shipment_id && item.provider_event_key === row.provider_event_key,
            );
            const stored = {
                projection_status: "pending",
                projection_attempts: 0,
                projection_next_attempt_at: "2026-07-12T11:31:00.000Z",
                projection_claimed_at: null,
                projection_claimed_by: null,
                projection_claim_token: null,
                projection_last_error: null,
                projection_manual_review_at: null,
                ...(index >= 0 ? shipmentEvents[index] : {}),
                ...row,
                id: index >= 0 ? shipmentEvents[index]?.id : shipmentEvents.length + 1,
                created_at: "2026-07-12T11:31:00.000Z",
            };
            if (index >= 0) {
                shipmentEvents[index] = stored;
            } else {
                shipmentEvents.push(stored);
            }
        }
        return new Response(null, { status: 204 });
    }
    return undefined;
}
