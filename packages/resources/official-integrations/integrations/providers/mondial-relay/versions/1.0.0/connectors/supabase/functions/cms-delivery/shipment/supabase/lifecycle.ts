import type { JsonRecord } from "../types.ts";
import { restJson } from "./client.ts";

export async function issueLabelAccessToken(
    externalOrderId: string,
    sellerCmsUserId: string,
    tokenHash: string,
    expiresAt: string,
): Promise<JsonRecord> {
    return await restJson<JsonRecord>("rpc/issue_label_access_token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_external_order_id: externalOrderId,
            p_seller_cms_user_id: sellerCmsUserId,
            p_token_hash: tokenHash,
            p_expires_at: expiresAt,
        }),
    });
}

export async function declareSellerHandoffRow(externalOrderId: string, sellerCmsUserId: string): Promise<JsonRecord> {
    return await restJson<JsonRecord>("rpc/declare_seller_handoff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_external_order_id: externalOrderId,
            p_seller_cms_user_id: sellerCmsUserId,
        }),
    });
}

export async function insertShipmentRecoveryEvent(row: JsonRecord): Promise<void> {
    await restJson<JsonRecord[]>("shipment_recovery_events", {
        method: "POST",
        headers: { "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify(row),
    });
}

export async function reserveShipmentCreation(input: {
    reservation: JsonRecord;
    quoteCheck: JsonRecord;
    quotePurpose: string;
    quoteExternalOrderId: string;
    selectedForCmsUserId: string;
    observedAt: string;
}): Promise<JsonRecord> {
    return await restJson<JsonRecord>("rpc/reserve_shipment_creation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_reservation: input.reservation,
            p_quote_check: input.quoteCheck,
            p_quote_purpose: input.quotePurpose,
            p_quote_external_order_id: input.quoteExternalOrderId,
            p_selected_for_cms_user_id: input.selectedForCmsUserId,
            p_observed_at: input.observedAt,
        }),
    });
}

export async function markStaleShipmentCreationsUnknown(limit: number): Promise<JsonRecord[]> {
    return await restJson<JsonRecord[]>("rpc/mark_stale_shipment_creations_unknown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ p_limit: limit, p_stale_seconds: 1200 }),
    });
}

export async function cancelShipmentUnscanned(externalOrderId: string, trackingUntil: string): Promise<JsonRecord> {
    return await restJson<JsonRecord>("rpc/cancel_shipment_unscanned", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ p_external_order_id: externalOrderId, p_tracking_until: trackingUntil }),
    });
}
