import type { JsonRecord } from "../types.ts";
import { restJson } from "./client.ts";

export async function shipmentEvents(shipmentId: string): Promise<JsonRecord[]> {
    return await restJson<JsonRecord[]>(
        `shipment_events?shipment_id=eq.${encodeURIComponent(shipmentId)}&select=${encodeURIComponent(eventSelect())}&order=occurred_at.desc.nullslast,created_at.desc`,
        { method: "GET" },
    );
}

export async function claimShipmentsDueForTracking(workerId: string, limit: number): Promise<JsonRecord[]> {
    return await restJson<JsonRecord[]>("rpc/claim_due_shipments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ p_worker_id: workerId, p_limit: limit }),
    });
}

export async function upsertShipmentEvents(rows: JsonRecord[]): Promise<void> {
    if (!rows.length) {
        return;
    }
    await restJson<JsonRecord[]>("shipment_events?on_conflict=shipment_id,provider_event_key", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(rows),
    });
}

export async function pendingShipmentEvents(workerId: string, limit: number): Promise<JsonRecord[]> {
    return await restJson<JsonRecord[]>("rpc/claim_pending_shipment_events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_worker_id: workerId,
            p_limit: limit,
            p_lease_seconds: 300,
            p_max_attempts: 5,
        }),
    });
}

export async function acknowledgeShipmentEvent(eventId: number, claimToken: string): Promise<boolean> {
    return await restJson<boolean>("rpc/complete_shipment_event_projection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ p_event_id: eventId, p_claim_token: claimToken }),
    });
}

export async function failShipmentEventProjection(
    eventId: number,
    claimToken: string,
    error: string,
): Promise<JsonRecord> {
    return await restJson<JsonRecord>("rpc/fail_shipment_event_projection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_event_id: eventId,
            p_claim_token: claimToken,
            p_error: error.slice(0, 2000),
            p_retry_delay_seconds: 60,
            p_max_attempts: 5,
        }),
    });
}

export async function shipmentProjectionExceptionRows(limit: number, offset: number): Promise<JsonRecord[]> {
    return await restJson<JsonRecord[]>(
        `shipment_events?projection_status=in.(retry_wait,manual_review)` +
            `&select=${encodeURIComponent(eventSelect())}&order=projection_manual_review_at.desc.nullslast,created_at.asc,id.asc` +
            `&limit=${limit}&offset=${offset}`,
        { method: "GET" },
    );
}

export async function projectionHealth(): Promise<JsonRecord> {
    return await restJson<JsonRecord>("rpc/get_projection_health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
    });
}

export async function reviewShipmentEventProjection(
    eventId: number,
    action: string,
    actorCmsUserId: string,
    reason: string,
): Promise<JsonRecord> {
    return await restJson<JsonRecord>("rpc/review_shipment_event_projection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_event_id: eventId,
            p_action: action,
            p_actor_cms_user_id: actorCmsUserId,
            p_reason: reason,
        }),
    });
}

function eventSelect(): string {
    return [
        "id",
        "shipment_id",
        "order_public_id",
        "expedition_number",
        "provider_event_key",
        "normalized_status",
        "occurred_at",
        "commerce_projected_at",
        "projection_status",
        "projection_attempts",
        "projection_next_attempt_at",
        "projection_claimed_at",
        "projection_claimed_by",
        "projection_claim_token",
        "projection_last_error",
        "projection_manual_review_at",
        "event_label",
        "event_date",
        "event_time",
        "location",
        "relay_number",
        "relay_country",
        "created_at",
    ].join(",");
}
