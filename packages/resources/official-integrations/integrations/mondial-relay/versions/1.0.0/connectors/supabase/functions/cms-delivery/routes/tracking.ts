import { HttpError, json, requireCmsRequest, requiredQuery } from "../http.ts";
import { trackingSummaryContextByExpedition } from "../shipment/read-contexts.ts";
import { reconcileShipment, trackingRefreshDue } from "../shipment/reconciliation.ts";
import { shipmentEvents, shipmentRowByExpedition } from "../shipment/supabase.ts";
import type { JsonRecord } from "../shipment/types.ts";
import { publicTrackingEvent, trackingJson } from "./shipments/presentation.ts";

export async function tracking(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const expeditionNumber = requiredQuery(url, "expeditionNumber");
    const row = await shipmentRowByExpedition(expeditionNumber);
    if (!row) {
        throw new HttpError(404, "shipment not found");
    }
    if (trackingRefreshDue(row)) {
        const synchronized = await reconcileShipment(row);
        Object.assign(row, {
            status: synchronized.status,
            latest_event_label: synchronized.latestEventLabel ?? row.latest_event_label,
            latest_event_at: synchronized.latestEventAt ?? row.latest_event_at,
            carrier_accepted_at: synchronized.carrierAcceptedAt,
            recipient_handoff_at: synchronized.recipientHandoffAt,
            tracking_checked_at: synchronized.checkedAt,
        });
    }
    const events = await shipmentEvents(String(row.id));
    return json(trackingJson(expeditionNumber, row, events));
}

export async function parseTrackingLink(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const link = requiredQuery(url, "url");
    const parsed = parseMondialRelayTrackingLink(link);
    if (!parsed.expeditionNumber) {
        throw new HttpError(400, "unable to extract Mondial Relay expedition number");
    }
    return json({ ...parsed, tracking: await trackingSummary(parsed.expeditionNumber) });
}

async function trackingSummary(expeditionNumber: string): Promise<JsonRecord> {
    const context = await trackingSummaryContextByExpedition(expeditionNumber);
    const row = context.shipment;
    if (!row) {
        return { expeditionNumber, status: "unknown", events: [] };
    }
    return {
        expeditionNumber,
        status: row.status ?? "created",
        latestEventLabel: row.latest_event_label ?? "",
        latestEventAt: row.latest_event_at ?? "",
        events: context.events.map(publicTrackingEvent),
    };
}

function parseMondialRelayTrackingLink(value: string): JsonRecord {
    const url = new URL(value);
    const expeditionNumber =
        url.searchParams.get("numeroExpedition") ??
        url.searchParams.get("expedition") ??
        url.pathname.match(/(\d{8,})/)?.[1] ??
        "";
    const postalCode = url.searchParams.get("codePostal") ?? url.searchParams.get("cp") ?? "";
    return {
        carrier: "mondial-relay",
        expeditionNumber,
        postalCode,
        url: value,
    };
}
