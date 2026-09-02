import { projectRows } from "../projection.ts";
import { jsonResponse } from "../responses.ts";
import type { JsonRecord } from "../runtime.ts";
import { supabaseUrl } from "../runtime.ts";
import type { RouterContext } from "./types.ts";

export function handleLabelRequests(context: RouterContext): Response | undefined {
    const { method, requestBody, state, url } = context;
    const { insertedShipments, labelAccessTokens, shipmentRecoveryEvents } = state;
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/rpc/issue_label_access_token" && method === "POST") {
        const body = JSON.parse(requestBody) as JsonRecord;
        const shipment = insertedShipments.find((item) => item.external_order_id === body.p_external_order_id);
        if (!shipment) {
            return jsonResponse({ message: "not_found: shipment" }, 404);
        }
        if (shipment.seller_cms_user_id !== body.p_seller_cms_user_id) {
            return jsonResponse({ message: "not_found: shipment" }, 404);
        }
        if (shipment.status !== "label_ready" || shipment.carrier_accepted_at) {
            return jsonResponse({ message: "conflict: the shipment label is not available" }, 409);
        }
        const token = {
            token_hash: body.p_token_hash,
            shipment_id: shipment.id,
            seller_cms_user_id: body.p_seller_cms_user_id,
            expires_at: body.p_expires_at,
            created_at: "2026-07-12T11:00:00.000Z",
            revoked_at: null,
        };
        labelAccessTokens.push(token);
        return jsonResponse(token, 200);
    }
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/rpc/get_label_access_context" && method === "POST") {
        const body = JSON.parse(requestBody) as JsonRecord;
        const token = labelAccessTokens.find(
            (row) => row.token_hash === body.p_token_hash && row.seller_cms_user_id === body.p_seller_cms_user_id,
        );
        if (!token || token.revoked_at) {
            return jsonResponse({ state: "not_found" }, 200);
        }
        if (Date.parse(String(token.expires_at)) <= Date.now()) {
            return jsonResponse({ state: "expired" }, 200);
        }
        const shipment = insertedShipments.find((row) => row.id === token.shipment_id);
        if (
            !shipment ||
            !shipment.label_url ||
            ["cancelled_unscanned", "cancelled", "manual_review"].includes(String(shipment.status))
        ) {
            return jsonResponse({ state: "label_missing" }, 200);
        }
        return jsonResponse(
            {
                state: "ok",
                shipment: {
                    expedition_number: shipment.expedition_number,
                    label_url: shipment.label_url,
                },
            },
            200,
        );
    }
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/label_access_tokens" && method === "GET") {
        const tokenHash = url.searchParams.get("token_hash")?.replace(/^eq\./, "");
        const seller = url.searchParams.get("seller_cms_user_id")?.replace(/^eq\./, "");
        return jsonResponse(
            projectRows(
                url,
                labelAccessTokens.filter(
                    (row) =>
                        (!tokenHash || row.token_hash === tokenHash) && (!seller || row.seller_cms_user_id === seller),
                ),
            ),
            200,
        );
    }
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/shipment_recovery_events" && method === "POST") {
        shipmentRecoveryEvents.push(JSON.parse(requestBody) as JsonRecord);
        return new Response(null, { status: 204 });
    }
    return undefined;
}
