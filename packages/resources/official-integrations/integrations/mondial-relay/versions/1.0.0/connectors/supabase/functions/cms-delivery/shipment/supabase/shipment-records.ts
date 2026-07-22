import type { JsonRecord } from "../types.ts";

export function shipmentSelect(): string {
    return [
        "id",
        "external_order_id",
        "idempotency_key",
        "expedition_number",
        "tracking_number",
        "status",
        "last_error",
        "provider_call_started_at",
        "creation_manual_review_at",
        "cancellation_tracking_until",
        "seller_cms_user_id",
        "delivery_quote_id",
        "label_format",
        "tracking_url",
        "mode_collection",
        "mode_delivery",
        "delivery_relay_country",
        "delivery_relay_number",
        "sender_name",
        "sender_email",
        "sender_phone",
        "sender_address_line1",
        "sender_address_line2",
        "sender_address_line3",
        "sender_postal_code",
        "sender_city",
        "sender_country",
        "recipient_name",
        "recipient_email",
        "recipient_phone",
        "recipient_address_line1",
        "recipient_address_line2",
        "recipient_address_line3",
        "recipient_postal_code",
        "recipient_city",
        "recipient_country",
        "weight_grams",
        "declared_value_minor_amount",
        "declared_currency",
        "package_count",
        "length_cm",
        "size_code",
        "insurance_level",
        "instructions",
        "latest_event_label",
        "latest_event_at",
        "tracking_checked_at",
        "tracking_next_attempt_at",
        "tracking_claimed_at",
        "tracking_claimed_by",
        "carrier_accepted_at",
        "arrived_at_pickup_point_at",
        "available_for_pickup_at",
        "recipient_handoff_at",
        "pickup_expired_at",
        "returning_to_sender_at",
        "returned_to_sender_at",
        "incident_at",
        "lost_at",
        "seller_handoff_declared_at",
        "metadata",
        "raw_response",
        "created_at",
        "updated_at",
    ].join(",");
}

export function shipmentTrackingSelect(): string {
    return [
        "id",
        "expedition_number",
        "status",
        "tracking_url",
        "delivery_relay_number",
        "latest_event_label",
        "latest_event_at",
        "carrier_accepted_at",
        "seller_handoff_declared_at",
        "recipient_handoff_at",
        "created_at",
    ].join(",");
}

export function shipmentDetailEventSelect(): string {
    return ["normalized_status", "occurred_at", "event_label", "event_date", "event_time", "location"].join(",");
}

export function camelizeRecord(record: JsonRecord): JsonRecord {
    const out: JsonRecord = {};
    for (const [key, value] of Object.entries(record)) {
        out[camelKey(key)] = value;
    }
    if (typeof out.deliveryRelayNumber === "string") {
        out.deliveryRelayLocation = out.deliveryRelayNumber;
    }
    return out;
}

function camelKey(value: string): string {
    return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
