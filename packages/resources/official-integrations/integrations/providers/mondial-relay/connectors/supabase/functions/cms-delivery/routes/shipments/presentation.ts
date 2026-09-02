import { isRecord } from "../../http.ts";
import { camelizeRecord } from "../../shipment/supabase/index.ts";
import type { JsonRecord } from "../../shipment/types.ts";

export function trackingJson(expeditionNumber: string, row: JsonRecord, events: JsonRecord[]): JsonRecord {
    return {
        expeditionNumber,
        status: row.status ?? "created",
        latestEventLabel: row.latest_event_label ?? "",
        latestEventAt: row.latest_event_at ?? "",
        carrierAcceptedAt: row.carrier_accepted_at ?? "",
        recipientHandoffAt: row.recipient_handoff_at ?? "",
        events: events.map(publicTrackingEvent),
    };
}

export function publicTrackingEvent(row: JsonRecord): JsonRecord {
    return {
        normalizedStatus: row.normalized_status,
        occurredAt: row.occurred_at,
        eventLabel: row.event_label,
        eventDate: row.event_date,
        eventTime: row.event_time,
        location: row.location,
    };
}

export function shipmentDetailJson(row: JsonRecord): JsonRecord {
    const events = Array.isArray(row.events) ? row.events.filter(isRecord) : [];
    return {
        ...toShipmentJson(row),
        events: events.map(publicTrackingEvent),
    };
}

export function shipmentTrackingJson(row: JsonRecord): JsonRecord {
    const detail = shipmentDetailJson(row);
    return {
        id: detail.id,
        expeditionNumber: detail.expeditionNumber,
        status: detail.status,
        trackingUrl: detail.trackingUrl,
        deliveryRelayLocation: detail.deliveryRelayLocation,
        latestEventLabel: detail.latestEventLabel,
        latestEventAt: detail.latestEventAt,
        carrierAcceptedAt: detail.carrierAcceptedAt,
        sellerHandoffDeclaredAt: detail.sellerHandoffDeclaredAt,
        recipientHandoffAt: detail.recipientHandoffAt,
        createdAt: detail.createdAt,
        events: detail.events,
    };
}

export function toShipmentJson(row: JsonRecord): JsonRecord {
    const out = camelizeRecord(row);
    if (typeof out.deliveryRelayNumber === "string") {
        out.deliveryRelayLocation = out.deliveryRelayNumber;
    }
    return out;
}
