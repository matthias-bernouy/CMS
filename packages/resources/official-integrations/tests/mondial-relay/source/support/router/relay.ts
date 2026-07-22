import { projectRows } from "../projection.ts";
import { jsonResponse } from "../responses.ts";
import type { JsonRecord } from "../runtime.ts";
import { supabaseUrl } from "../runtime.ts";
import type { RouterContext } from "./types.ts";

export function handleRelayRequests(context: RouterContext): Response | undefined {
    const { method, requestBody, state, url } = context;
    const { deliveryQuotes, insertedShipments, relaySelections } = state;
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/relay_selections" && method === "POST") {
        const row = JSON.parse(requestBody) as JsonRecord;
        const index = relaySelections.findIndex((item) => item.external_order_id === row.external_order_id);
        const stored = {
            ...(index >= 0 ? relaySelections[index] : {}),
            ...row,
            created_at: index >= 0 ? relaySelections[index]?.created_at : "2026-07-02T10:00:00.000Z",
            updated_at: "2026-07-02T10:05:00.000Z",
        };
        if (index >= 0) {
            relaySelections[index] = stored;
        } else {
            relaySelections.push(stored);
        }
        return jsonResponse(projectRows(url, [stored]), 201);
    }
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/relay_selections" && method === "GET") {
        const externalOrderId = url.searchParams.get("external_order_id")?.replace(/^eq\./, "");
        return jsonResponse(
            projectRows(
                url,
                relaySelections.filter((row) => !externalOrderId || row.external_order_id === externalOrderId),
            ),
            200,
        );
    }
    if (
        url.origin === supabaseUrl &&
        url.pathname === "/rest/v1/rpc/read_relay_selection_setup_context" &&
        method === "POST"
    ) {
        const body = JSON.parse(requestBody) as JsonRecord;
        const shipment = insertedShipments.find(
            (row) => row.external_order_id === String(body.p_external_order_id ?? ""),
        );
        if (shipment) {
            return jsonResponse({ outcome: "shipment_exists", settings: null }, 200);
        }
        return jsonResponse(
            {
                outcome: "ready",
                settings: body.p_read_settings === true ? state.settingRow : null,
            },
            200,
        );
    }
    if (
        url.origin === supabaseUrl &&
        url.pathname === "/rest/v1/rpc/read_relay_selection_context" &&
        method === "POST"
    ) {
        const body = JSON.parse(requestBody) as JsonRecord;
        const externalOrderId = String(body.p_external_order_id ?? "");
        const selection = relaySelections.find((row) => row.external_order_id === externalOrderId);
        if (selection) {
            return jsonResponse({ outcome: "selection", row: selection }, 200);
        }
        const selectedFor = String(body.p_selected_for_cms_user_id ?? "");
        const quote = deliveryQuotes
            .filter((row) => row.external_order_id === externalOrderId && row.selected_for_cms_user_id === selectedFor)
            .sort((left, right) => Number(right.revision) - Number(left.revision))[0];
        if (!quote) {
            return jsonResponse({ outcome: "missing", row: null }, 200);
        }
        const publicQuote = { ...quote };
        delete publicQuote.recipient_snapshot;
        delete publicQuote.seller_fulfillment_snapshot;
        delete publicQuote.request_snapshot;
        return jsonResponse({ outcome: "quote", row: publicQuote }, 200);
    }
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/delivery_quotes" && method === "GET") {
        const quoteId = url.searchParams.get("quote_id")?.replace(/^eq\./, "");
        const externalOrderId = url.searchParams.get("external_order_id")?.replace(/^eq\./, "");
        const selectedFor = url.searchParams.get("selected_for_cms_user_id")?.replace(/^eq\./, "");
        return jsonResponse(
            projectRows(
                url,
                deliveryQuotes.filter(
                    (row) =>
                        (!quoteId || row.quote_id === quoteId) &&
                        (!externalOrderId || row.external_order_id === externalOrderId) &&
                        (!selectedFor || row.selected_for_cms_user_id === selectedFor),
                ),
            ),
            200,
        );
    }
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/rpc/reserve_delivery_quote" && method === "POST") {
        const body = JSON.parse(requestBody) as JsonRecord;
        const existing = deliveryQuotes.find((row) => row.request_key === body.p_request_key);
        if (existing) {
            if (
                existing.request_snapshot !== undefined &&
                JSON.stringify(existing.request_snapshot) !== JSON.stringify(body.p_request_snapshot)
            ) {
                return jsonResponse(
                    { message: "conflict: delivery quote request replay changed immutable input" },
                    409,
                );
            }
            return jsonResponse(existing, 200);
        }
        const now = "2026-07-13T10:00:00.000Z";
        const stored = {
            quote_id: body.p_quote_id,
            request_key: body.p_request_key,
            external_order_id: body.p_external_order_id,
            order_version: body.p_order_version,
            revision: deliveryQuotes.filter((row) => row.external_order_id === body.p_external_order_id).length + 1,
            selected_by: body.p_selected_by,
            selected_for_cms_user_id: body.p_selected_for_cms_user_id,
            relay_location: body.p_relay_location,
            relay_country: body.p_relay_country,
            relay_number: body.p_relay_number,
            relay_name: body.p_relay_name,
            relay_address_line1: body.p_relay_address_line1,
            relay_address_line2: body.p_relay_address_line2,
            relay_postal_code: body.p_relay_postal_code,
            relay_city: body.p_relay_city,
            relay_latitude: body.p_relay_latitude,
            relay_longitude: body.p_relay_longitude,
            weight_grams: body.p_weight_grams,
            shipping_amount: body.p_shipping_amount,
            currency: body.p_currency,
            merchandise_subtotal_minor_amount: body.p_merchandise_subtotal_minor_amount,
            recipient_snapshot: body.p_recipient_snapshot,
            seller_fulfillment_snapshot: body.p_seller_fulfillment_snapshot,
            relay_snapshot: body.p_relay_snapshot,
            request_snapshot: body.p_request_snapshot,
            quoted_at: now,
            expires_at: "2099-07-13T10:15:00.000Z",
            created_at: now,
        };
        deliveryQuotes.push(stored);
        return jsonResponse(stored, 200);
    }
    return undefined;
}
