import { HttpError, isRecord } from "../http.ts";
import { reconcileShipment, trackingRefreshDue } from "./reconciliation/index.ts";
import { shipmentEvents, shipmentRowByExpedition, shipmentWithEventsRowByExpedition } from "./supabase/index.ts";
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
    if (shipment.external_order_id !== expectedExternalOrderId) {
        return { shipment, tracking: shipment, events: currentEvents };
    }

    const tracking = await shipmentRowByExpedition(expeditionNumber);
    if (!tracking) {
        throw new HttpError(404, "shipment not found");
    }
    if (!trackingRefreshDue(tracking)) {
        return { shipment, tracking, events: await shipmentEvents(String(tracking.id)) };
    }

    const synchronized = await reconcileShipment(tracking);
    const synchronizedTracking = {
        ...tracking,
        status: synchronized.status,
        latest_event_label: synchronized.latestEventLabel ?? tracking.latest_event_label,
        latest_event_at: synchronized.latestEventAt ?? tracking.latest_event_at,
        carrier_accepted_at: synchronized.carrierAcceptedAt,
        recipient_handoff_at: synchronized.recipientHandoffAt,
        tracking_checked_at: synchronized.checkedAt,
    };
    const events = await shipmentEvents(String(tracking.id));
    return { shipment, tracking: synchronizedTracking, events };
}
