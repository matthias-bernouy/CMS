import type { JsonRecord } from "../types.ts";
import { getOne, restJson } from "./client.ts";
import { shipmentDetailEventSelect, shipmentSelect, shipmentTrackingSelect } from "./shipment-records.ts";

export async function shipmentsRows(filters: string): Promise<JsonRecord[]> {
    return await restJson<JsonRecord[]>(`shipments?${filters}`, { method: "GET" });
}

export async function shipmentRowById(id: string): Promise<JsonRecord | null> {
    return await getOne("shipments", { id }, shipmentSelect());
}

export async function shipmentRowByExpedition(expeditionNumber: string): Promise<JsonRecord | null> {
    return await getOne("shipments", { expedition_number: expeditionNumber }, shipmentSelect());
}

export async function shipmentWithEventsRowById(id: string): Promise<JsonRecord | null> {
    return await shipmentWithEventsRow({ id });
}

export async function shipmentWithEventsRowByExpedition(expeditionNumber: string): Promise<JsonRecord | null> {
    return await shipmentWithEventsRow({ expedition_number: expeditionNumber });
}

export async function shipmentWithEventsRowByExternalOrderId(externalOrderId: string): Promise<JsonRecord | null> {
    return await shipmentWithEventsRow(
        { external_order_id: externalOrderId },
        { newestFirst: true, shipmentFields: shipmentTrackingSelect() },
    );
}

export async function shipmentRowByExternalOrderId(externalOrderId: string): Promise<JsonRecord | null> {
    return await getOne("shipments", { external_order_id: externalOrderId }, shipmentSelect());
}

export async function updateShipment(
    id: string,
    patch: JsonRecord,
    expectedStatus?: string,
): Promise<JsonRecord | null> {
    const filters = [`id=eq.${encodeURIComponent(id)}`];
    if (expectedStatus) {
        filters.push(`status=eq.${encodeURIComponent(expectedStatus)}`);
    }
    const rows = await restJson<JsonRecord[]>(
        `shipments?${filters.join("&")}&select=${encodeURIComponent(shipmentSelect())}`,
        {
            method: "PATCH",
            headers: {
                "content-type": "application/json",
                prefer: "return=representation",
            },
            body: JSON.stringify(patch),
        },
    );
    return rows[0] ?? null;
}

async function shipmentWithEventsRow(
    filters: Record<string, string>,
    options: { newestFirst?: boolean; shipmentFields?: string } = {},
): Promise<JsonRecord | null> {
    const select =
        `${options.shipmentFields ?? shipmentSelect()},` +
        `events:shipment_events!shipment_events_shipment_id_fkey(${shipmentDetailEventSelect()})`;
    const params = [`select=${encodeURIComponent(select)}`, "limit=1"];
    for (const [key, value] of Object.entries(filters)) {
        params.push(`${encodeURIComponent(key)}=eq.${encodeURIComponent(value)}`);
    }
    if (options.newestFirst) {
        params.push(`order=${encodeURIComponent("created_at.desc")}`);
    }
    params.push(`events.order=${encodeURIComponent("occurred_at.desc.nullslast,created_at.desc")}`);
    const rows = await restJson<JsonRecord[]>(`shipments?${params.join("&")}`, { method: "GET" });
    return rows[0] ?? null;
}
