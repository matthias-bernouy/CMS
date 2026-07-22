export type JsonRecord = Record<string, unknown>;

export const buyerId = "buyer-123";
export const orderId = "order-relay-selection";

export function selectionRow(overrides: JsonRecord = {}): JsonRecord {
    return {
        external_order_id: orderId,
        relay_location: "FR-111111",
        relay_country: "FR",
        relay_number: "111111",
        relay_name: "SELECTED RELAY",
        address_line1: "1 RUE DE LA SELECTION",
        address_line2: "",
        postal_code: "75001",
        city: "PARIS",
        latitude: 48.86,
        longitude: 2.34,
        weight_grams: 500,
        shipping_amount: 450,
        currency: "eur",
        selected_by: "selection-owner",
        snapshot: { nature: "1", pointType: "relay_point" },
        created_at: "2026-07-20T09:00:00.000Z",
        updated_at: "2026-07-20T10:00:00.000Z",
        ...overrides,
    };
}

export function quoteRow(revision: number, userId = buyerId, overrides: JsonRecord = {}): JsonRecord {
    return {
        quote_id: `quote-${userId}-${revision}`,
        request_key: `request-${userId}-${revision}`,
        external_order_id: orderId,
        order_version: 7,
        revision,
        selected_by: userId,
        selected_for_cms_user_id: userId,
        relay_location: `FR-${String(revision).padStart(6, "0")}`,
        relay_country: "FR",
        relay_number: String(revision).padStart(6, "0"),
        relay_name: `QUOTE REVISION ${revision}`,
        relay_address_line1: `${revision} RUE DE LA QUOTE`,
        relay_address_line2: "",
        relay_postal_code: "75002",
        relay_city: "PARIS",
        relay_latitude: 48.87,
        relay_longitude: 2.35,
        weight_grams: 750,
        shipping_amount: 550,
        currency: "eur",
        merchandise_subtotal_minor_amount: 12_345,
        relay_snapshot: { nature: "C", pointType: "locker" },
        quoted_at: `2026-07-20T10:0${revision}:00.000Z`,
        expires_at: "2099-07-20T11:00:00.000Z",
        created_at: `2026-07-20T10:0${revision}:00.000Z`,
        ...overrides,
    };
}

export function expectedSelection(row = selectionRow()): JsonRecord {
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
        nature: "1",
        pointType: "relay_point",
        weightGrams: row.weight_grams,
        shippingAmount: row.shipping_amount,
        currency: row.currency,
        selectedAt: row.updated_at,
    };
}

export function expectedQuote(row: JsonRecord): JsonRecord {
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
        nature: "C",
        pointType: "locker",
        weightGrams: row.weight_grams,
        shippingAmount: row.shipping_amount,
        currency: row.currency,
        merchandiseSubtotalMinorAmount: row.merchandise_subtotal_minor_amount,
        quotedAt: row.quoted_at,
        expiresAt: row.expires_at,
    };
}
