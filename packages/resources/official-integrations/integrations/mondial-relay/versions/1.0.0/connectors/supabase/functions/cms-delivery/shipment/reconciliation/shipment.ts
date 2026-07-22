import { fetchTracking } from "../../provider/tracking.ts";
import { statusAfterObservation } from "../../provider/tracking-status/index.ts";
import { upsertShipmentEvents } from "../supabase/index.ts";
import type { JsonRecord } from "../types.ts";
import {
    cancellationCarrierActivity,
    latestProviderEvent,
    milestonePatch,
    normalizedObservations,
} from "./observations.ts";
import { optimisticShipmentUpdate } from "./updates.ts";

export async function reconcileShipment(row: JsonRecord): Promise<JsonRecord> {
    const expeditionNumber = String(row.expedition_number ?? "");
    if (!expeditionNumber) {
        throw new Error("shipment has no provider reference");
    }
    const checkedAt = new Date().toISOString();
    const result = await fetchTracking(expeditionNumber);
    const providerEvents = result.events.map((event) => ({
        ...event,
        shipment_id: row.id,
        order_public_id: row.external_order_id,
        expedition_number: expeditionNumber,
    }));
    const observations = normalizedObservations(
        providerEvents,
        row,
        result.status,
        result.statusCode,
        result.label,
        checkedAt,
    );
    const currentStatus = String(row.status ?? "created");
    const cancellationObservations =
        currentStatus === "cancelled_unscanned"
            ? observations.filter((observation) => cancellationCarrierActivity(String(observation.normalizedStatus)))
            : observations;
    const storedProviderEvents =
        currentStatus === "cancelled_unscanned"
            ? providerEvents.map((event) =>
                  cancellationCarrierActivity(String(event.normalized_status ?? ""))
                      ? event
                      : { ...event, normalized_status: undefined },
              )
            : providerEvents;
    const providerKeys = new Set(storedProviderEvents.map((event) => event.provider_event_key));
    const storedEvents = [
        ...storedProviderEvents,
        ...cancellationObservations
            .filter((observation) => !providerKeys.has(observation.providerEventId))
            .map((observation) => ({
                shipment_id: row.id,
                order_public_id: row.external_order_id,
                expedition_number: expeditionNumber,
                provider_event_key: observation.providerEventId,
                normalized_status: observation.normalizedStatus,
                occurred_at: observation.occurredAt,
                event_label: result.label || `Statut Mondial Relay ${result.statusCode}`,
                raw_event: { summary: true, statusCode: result.statusCode },
            })),
    ];
    await upsertShipmentEvents(storedEvents);

    let nextStatus = observations
        .sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)))
        .reduce(
            (current, observation) => statusAfterObservation(current, String(observation.normalizedStatus)),
            statusAfterObservation(currentStatus, result.status),
        );
    if (currentStatus === "cancelled_unscanned") {
        const lateCarrierScan = cancellationObservations.length > 0;
        const trackingUntil = Date.parse(String(row.cancellation_tracking_until ?? ""));
        nextStatus = lateCarrierScan
            ? "manual_review"
            : Number.isFinite(trackingUntil) && Date.now() >= trackingUntil
              ? "cancelled"
              : "cancelled_unscanned";
    }
    const latest = latestProviderEvent(providerEvents);
    const patch: JsonRecord = {
        status: nextStatus,
        latest_event_label: result.label || latest?.event_label || null,
        latest_event_at: latest?.occurred_at || row.latest_event_at || null,
        tracking_checked_at: checkedAt,
        tracking_next_attempt_at: null,
        tracking_claimed_at: null,
        tracking_claimed_by: null,
        last_error:
            nextStatus === "manual_review" && currentStatus === "cancelled_unscanned"
                ? "carrier activity or ambiguity observed after local shipment cancellation"
                : null,
        raw_response: {
            ...record(row.raw_response),
            tracking: { ...result.raw, checkedAt },
        },
        ...milestonePatch(observations, row),
    };
    const updated = await optimisticShipmentUpdate(
        row,
        patch,
        observations.some((observation) => cancellationCarrierActivity(String(observation.normalizedStatus))),
    );
    return {
        id: updated.id,
        externalOrderId: updated.external_order_id,
        expeditionNumber,
        status: updated.status,
        latestEventLabel: updated.latest_event_label,
        latestEventAt: updated.latest_event_at,
        carrierAcceptedAt: updated.carrier_accepted_at,
        arrivedAtPickupPointAt: updated.arrived_at_pickup_point_at,
        availableForPickupAt: updated.available_for_pickup_at,
        recipientHandoffAt: updated.recipient_handoff_at,
        pickupExpiredAt: updated.pickup_expired_at,
        returningToSenderAt: updated.returning_to_sender_at,
        returnedToSenderAt: updated.returned_to_sender_at,
        incidentAt: updated.incident_at,
        lostAt: updated.lost_at,
        checkedAt,
        events: observations,
    };
}

function record(value: unknown): JsonRecord {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}
