import { projectRows } from "../../projection.ts";
import { jsonResponse } from "../../responses.ts";
import type { JsonRecord } from "../../runtime.ts";
import { supabaseUrl } from "../../runtime.ts";
import type { RouterContext } from "../types.ts";

export function handleEventPatches(context: RouterContext): Response | undefined {
    const { method, requestBody, state, url } = context;
    const { shipmentEvents } = state;
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/shipment_events" && method === "PATCH") {
        const patch = JSON.parse(requestBody) as JsonRecord;
        const orderPublicId = url.searchParams.get("order_public_id")?.replace(/^eq\./, "");
        const providerEventKey = url.searchParams.get("provider_event_key")?.replace(/^eq\./, "");
        const rows = shipmentEvents.filter(
            (row) =>
                row.order_public_id === orderPublicId &&
                row.provider_event_key === providerEventKey &&
                !row.commerce_projected_at,
        );
        for (const row of rows) {
            Object.assign(row, patch);
        }
        return jsonResponse(projectRows(url, rows), 200);
    }
    return undefined;
}
