import { stringValue } from "../../shipment/payload.ts";
import type { JsonRecord } from "../../shipment/types.ts";

export function deliveryQuoteJson(row: JsonRecord): JsonRecord {
    return {
        quoteId: row.quote_id,
        externalOrderId: row.external_order_id,
        orderVersion: row.order_version,
        revision: row.revision,
        selectedForCmsUserId: row.selected_for_cms_user_id,
        relayLocation: row.relay_location,
        country: row.relay_country,
        number: row.relay_number,
        name: row.relay_name,
        addressLine1: row.relay_address_line1,
        addressLine2: row.relay_address_line2,
        postalCode: row.relay_postal_code,
        city: row.relay_city,
        latitude: row.relay_latitude,
        longitude: row.relay_longitude,
        nature: relaySnapshotText(row, "relay_snapshot", "nature"),
        pointType: relaySnapshotPointType(row, "relay_snapshot"),
        weightGrams: row.weight_grams,
        shippingAmount: row.shipping_amount,
        currency: row.currency,
        merchandiseSubtotalMinorAmount: row.merchandise_subtotal_minor_amount,
        quotedAt: row.quoted_at,
        expiresAt: row.expires_at,
    };
}

export function relaySelectionJson(row: JsonRecord): JsonRecord {
    return {
        externalOrderId: row.external_order_id,
        relayLocation: row.relay_location,
        country: row.relay_country,
        number: row.relay_number,
        name: row.relay_name,
        addressLine1: row.address_line1,
        addressLine2: row.address_line2,
        postalCode: row.postal_code,
        city: row.city,
        latitude: row.latitude,
        longitude: row.longitude,
        nature: relaySnapshotText(row, "snapshot", "nature"),
        pointType: relaySnapshotPointType(row, "snapshot"),
        weightGrams: row.weight_grams,
        shippingAmount: row.shipping_amount,
        currency: row.currency,
        selectedAt: row.updated_at ?? row.created_at,
    };
}

function relaySnapshotText(row: JsonRecord, snapshotKey: string, field: string): string {
    const snapshot = row[snapshotKey];
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        return "";
    }
    return stringValue((snapshot as JsonRecord)[field]);
}

function relaySnapshotPointType(row: JsonRecord, snapshotKey: string): string {
    const pointType = relaySnapshotText(row, snapshotKey, "pointType");
    if (pointType) {
        return pointType;
    }
    const nature = relaySnapshotText(row, snapshotKey, "nature").toUpperCase();
    return nature ? (nature === "C" ? "locker" : "relay_point") : "";
}
