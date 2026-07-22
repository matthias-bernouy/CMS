import type { JsonRecord } from "../types.ts";
import { getOne, restJson } from "./client.ts";

export async function deliveryQuoteRow(quoteId: string): Promise<JsonRecord | null> {
    return await getOne("delivery_quotes", { quote_id: quoteId }, deliveryQuoteSelect(true));
}

export async function reserveDeliveryQuote(row: JsonRecord): Promise<JsonRecord> {
    return await restJson<JsonRecord>("rpc/reserve_delivery_quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(row),
    });
}

export async function upsertRelaySelectionRow(row: JsonRecord): Promise<JsonRecord> {
    const rows = await restJson<JsonRecord[]>(
        `relay_selections?on_conflict=external_order_id&select=${encodeURIComponent(relaySelectionSelect())}`,
        {
            method: "POST",
            headers: {
                "content-type": "application/json",
                prefer: "resolution=merge-duplicates,return=representation",
            },
            body: JSON.stringify(row),
        },
    );
    return rows[0] ?? row;
}

export async function settingsRow(id = "default"): Promise<JsonRecord | null> {
    return await getOne("settings", { id }, settingsSelect());
}

export async function upsertSettingsRow(row: JsonRecord): Promise<JsonRecord> {
    const next = { id: "default", ...row };
    const rows = await restJson<JsonRecord[]>(
        `settings?on_conflict=id&select=${encodeURIComponent(settingsSelect())}`,
        {
            method: "POST",
            headers: {
                "content-type": "application/json",
                prefer: "resolution=merge-duplicates,return=representation",
            },
            body: JSON.stringify(next),
        },
    );
    return rows[0] ?? next;
}

export function settingsSelect(): string {
    return [
        "id",
        "mode_collection",
        "mode_delivery",
        "sender_name",
        "sender_firstname",
        "sender_lastname",
        "sender_address_line1",
        "sender_address_line2",
        "sender_address_line3",
        "sender_postal_code",
        "sender_city",
        "sender_country",
        "sender_phone",
        "sender_mobile",
        "sender_email",
        "default_weight_grams",
        "default_package_count",
        "default_length_cm",
        "default_width_cm",
        "default_height_cm",
        "default_content",
        "default_shipping_amount",
        "declared_currency",
        "connect_culture",
        "connect_version_api",
        "connect_output_format",
        "connect_output_type",
        "created_at",
        "updated_at",
    ].join(",");
}

export function relaySelectionSelect(): string {
    return [
        "external_order_id",
        "relay_location",
        "relay_country",
        "relay_number",
        "relay_name",
        "address_line1",
        "address_line2",
        "postal_code",
        "city",
        "latitude",
        "longitude",
        "weight_grams",
        "shipping_amount",
        "currency",
        "selected_by",
        "snapshot",
        "created_at",
        "updated_at",
    ].join(",");
}

export function deliveryQuoteSelect(includePrivateSnapshots: boolean): string {
    return [
        "quote_id",
        "request_key",
        "external_order_id",
        "order_version",
        "revision",
        "selected_by",
        "selected_for_cms_user_id",
        "relay_location",
        "relay_country",
        "relay_number",
        "relay_name",
        "relay_address_line1",
        "relay_address_line2",
        "relay_postal_code",
        "relay_city",
        "relay_latitude",
        "relay_longitude",
        "weight_grams",
        "shipping_amount",
        "currency",
        "merchandise_subtotal_minor_amount",
        ...(includePrivateSnapshots ? ["recipient_snapshot", "seller_fulfillment_snapshot"] : []),
        "relay_snapshot",
        "quoted_at",
        "expires_at",
        "created_at",
    ].join(",");
}
