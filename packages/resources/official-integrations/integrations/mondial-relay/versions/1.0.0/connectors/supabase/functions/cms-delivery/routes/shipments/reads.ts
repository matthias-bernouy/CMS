import { HttpError, json, limitParam, offsetParam, queryText, requireCmsRequest, requiredQuery } from "../../http.ts";
import { readShipmentTrackingContext } from "../../shipment/tracking-context.ts";
import {
    shipmentSelect,
    shipmentsRows,
    shipmentWithEventsRowByExpedition,
    shipmentWithEventsRowByExternalOrderId,
    shipmentWithEventsRowById,
} from "../../shipment/supabase.ts";
import type { JsonRecord } from "../../shipment/types.ts";
import { shipmentDetailJson, shipmentTrackingJson, toShipmentJson, trackingJson } from "./presentation.ts";

export async function shipments(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const limit = limitParam(url, 50);
    const offset = offsetParam(url);
    const filters = [
        `select=${encodeURIComponent(shipmentSelect())}`,
        `order=${encodeURIComponent("created_at.desc")}`,
        `limit=${limit}`,
        `offset=${offset}`,
    ];
    appendEqualFilter(filters, "status", queryText(url, "status"));
    appendEqualFilter(filters, "external_order_id", queryText(url, "externalOrderId"));
    const q = queryText(url, "q");
    if (q) {
        const value = q.replace(/[,*()]/g, " ").trim();
        if (value) {
            filters.push(
                `or=${encodeURIComponent(
                    [
                        `recipient_name.ilike.*${value}*`,
                        `recipient_city.ilike.*${value}*`,
                        `expedition_number.ilike.*${value}*`,
                        `external_order_id.ilike.*${value}*`,
                    ].join(","),
                )}`,
            );
        }
    }
    const rows = await shipmentsRows(filters.join("&"));
    return json({ items: rows.map(toShipmentJson), limit, offset });
}

export async function shipment(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const row = await shipmentWithEventsByRequest(url);
    if (!row) {
        throw new HttpError(404, "shipment not found");
    }
    return json(shipmentDetailJson(row));
}

export async function shipmentForExternalOrder(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const externalOrderId = requiredQuery(new URL(request.url), "externalOrderId");
    const row = await shipmentWithEventsRowByExternalOrderId(externalOrderId);
    return json({ items: row ? [shipmentTrackingJson(row)] : [] });
}

export async function systemShipmentTrackingContext(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const expeditionNumber = requiredQuery(url, "expeditionNumber");
    const expectedExternalOrderId = requiredQuery(url, "expectedExternalOrderId");
    const context = await readShipmentTrackingContext(expeditionNumber, expectedExternalOrderId);
    return json({
        shipment: shipmentDetailJson(context.shipment),
        tracking: trackingJson(expeditionNumber, context.tracking, context.events),
    });
}

async function shipmentWithEventsByRequest(url: URL): Promise<JsonRecord | null> {
    const id = queryText(url, "id");
    if (id) {
        return await shipmentWithEventsRowById(id);
    }
    const expeditionNumber = queryText(url, "expeditionNumber");
    if (expeditionNumber) {
        return await shipmentWithEventsRowByExpedition(expeditionNumber);
    }
    throw new HttpError(400, "id or expeditionNumber is required");
}

function appendEqualFilter(filters: string[], name: string, value: string | undefined): void {
    if (value) {
        filters.push(`${name}=eq.${encodeURIComponent(value)}`);
    }
}
