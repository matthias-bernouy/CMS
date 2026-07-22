import { normalizedStatuses } from "../../provider/tracking-status/index.ts";
import type { JsonRecord } from "../types.ts";

export function cancellationCarrierActivity(status: string): boolean {
    // Every normalized carrier observation is cancellation-blocking. In
    // particular, `incident` is also the fail-closed normalization for an
    // unknown STAT 83 response and for ambiguous/negative recipient labels.
    return (normalizedStatuses as readonly string[]).includes(status);
}

export function normalizedObservations(
    events: JsonRecord[],
    row: JsonRecord,
    summaryStatus: string,
    statusCode: string,
    label: string,
    checkedAt: string,
): JsonRecord[] {
    const normalized = events
        .filter((event) => event.normalized_status && event.occurred_at)
        .map((event) => ({
            orderPublicId: row.external_order_id,
            providerEventId: event.provider_event_key,
            normalizedStatus: event.normalized_status,
            occurredAt: event.occurred_at,
            providerReference: row.expedition_number,
            ...(event.normalized_status === "carrier_accepted" ? { carrierAcceptedAt: event.occurred_at } : {}),
            ...(event.normalized_status === "collected_by_recipient" ? { recipientHandoffAt: event.occurred_at } : {}),
        }));
    if (normalized.length || !commerceStatus(summaryStatus)) {
        return normalized;
    }
    return [
        {
            orderPublicId: row.external_order_id,
            providerEventId: `mondial-relay|${row.expedition_number}|summary|${statusCode}|${fold(label)}`,
            normalizedStatus: summaryStatus,
            occurredAt: checkedAt,
            providerReference: row.expedition_number,
        },
    ];
}

function commerceStatus(value: string): boolean {
    return [
        "carrier_accepted",
        "in_transit",
        "arrived_at_pickup_point",
        "available_for_pickup",
        "collected_by_recipient",
        "incident",
        "lost",
        "pickup_expired",
        "returning_to_sender",
        "returned_to_sender",
    ].includes(value);
}

export function milestonePatch(observations: JsonRecord[], row: JsonRecord): JsonRecord {
    const columns: Record<string, string> = {
        carrier_accepted: "carrier_accepted_at",
        arrived_at_pickup_point: "arrived_at_pickup_point_at",
        available_for_pickup: "available_for_pickup_at",
        collected_by_recipient: "recipient_handoff_at",
        pickup_expired: "pickup_expired_at",
        returning_to_sender: "returning_to_sender_at",
        returned_to_sender: "returned_to_sender_at",
        incident: "incident_at",
        lost: "lost_at",
    };
    const patch: JsonRecord = {};
    for (const observation of observations) {
        const column = columns[String(observation.normalizedStatus)];
        if (column && !row[column] && !patch[column]) {
            patch[column] = observation.occurredAt;
        }
    }
    return patch;
}

export function latestProviderEvent(events: JsonRecord[]): JsonRecord | null {
    return (
        [...events]
            .filter((event) => event.occurred_at)
            .sort((left, right) => String(left.occurred_at).localeCompare(String(right.occurred_at)))
            .at(-1) ?? null
    );
}

function fold(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
}
