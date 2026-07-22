import { HttpError, isRecord } from "../http.ts";
import { reconcileShipment, trackingRefreshDue } from "./reconciliation.ts";
import { shipmentEvents, shipmentWithEventsRowByExpedition } from "./supabase/index.ts";
import type { JsonRecord } from "./types.ts";

export type ShipmentTrackingContext = {
    shipment: JsonRecord;
    tracking: JsonRecord;
    events: JsonRecord[];
};

export async function readShipmentTrackingContext(
    expeditionNumber: string,
    expectedExternalOrderId: string,
): Promise<ShipmentTrackingContext> {
    const shipment = await shipmentWithEventsRowByExpedition(expeditionNumber);
    if (!shipment) {
        throw new HttpError(404, "shipment not found");
    }

    const currentEvents = Array.isArray(shipment.events) ? shipment.events.filter(isRecord) : [];
    if (shipment.external_order_id !== expectedExternalOrderId || !trackingRefreshDue(shipment)) {
        return { shipment, tracking: shipment, events: currentEvents };
    }

    const synchronized = await reconcileShipment(shipment);
    const tracking = {
        ...shipment,
        status: synchronized.status,
        latest_event_label: synchronized.latestEventLabel ?? shipment.latest_event_label,
        latest_event_at: synchronized.latestEventAt ?? shipment.latest_event_at,
        carrier_accepted_at: synchronized.carrierAcceptedAt,
        recipient_handoff_at: synchronized.recipientHandoffAt,
        tracking_checked_at: synchronized.checkedAt,
    };
    const events = await shipmentEvents(String(shipment.id));
    return { shipment, tracking, events };
}
