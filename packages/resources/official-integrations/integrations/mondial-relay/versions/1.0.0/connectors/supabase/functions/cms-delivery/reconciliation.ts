import { fetchTracking } from "./tracking.ts";
import { normalizedStatuses, statusAfterObservation } from "./tracking-status.ts";
import {
    pendingShipmentEvents,
    shipmentRowById,
    claimShipmentsDueForTracking,
    updateShipment,
    upsertShipmentEvents,
} from "./supabase.ts";
import type { JsonRecord } from "./types.ts";

export async function reconcileShipment(row: JsonRecord): Promise<JsonRecord> {
    const expeditionNumber = String(row.expedition_number ?? "");
    if (!expeditionNumber) throw new Error("shipment has no provider reference");
    const checkedAt = new Date().toISOString();
    const result = await fetchTracking(expeditionNumber);
    const providerEvents = result.events.map(event => ({
        ...event,
        shipment_id: row.id,
        order_public_id: row.external_order_id,
        expedition_number: expeditionNumber,
    }));
    const observations = normalizedObservations(providerEvents, row, result.status, result.statusCode, result.label, checkedAt);
    const currentStatus = String(row.status ?? "created");
    const cancellationObservations = currentStatus === "cancelled_unscanned"
        ? observations.filter(observation => cancellationCarrierActivity(String(observation.normalizedStatus)))
        : observations;
    const storedProviderEvents = currentStatus === "cancelled_unscanned"
        ? providerEvents.map(event => cancellationCarrierActivity(String(event.normalized_status ?? ""))
            ? event
            : { ...event, normalized_status: undefined })
        : providerEvents;
    const providerKeys = new Set(storedProviderEvents.map(event => event.provider_event_key));
    const storedEvents = [
        ...storedProviderEvents,
        ...cancellationObservations.filter(observation => !providerKeys.has(observation.providerEventId)).map(observation => ({
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
        .reduce((current, observation) => statusAfterObservation(current, String(observation.normalizedStatus)),
            statusAfterObservation(currentStatus, result.status));
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
        last_error: nextStatus === "manual_review" && currentStatus === "cancelled_unscanned"
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
        observations.some(observation => cancellationCarrierActivity(String(observation.normalizedStatus))),
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

function cancellationCarrierActivity(status: string): boolean {
    // Every normalized carrier observation is cancellation-blocking. In
    // particular, `incident` is also the fail-closed normalization for an
    // unknown STAT 83 response and for ambiguous/negative recipient labels.
    return (normalizedStatuses as readonly string[]).includes(status);
}

export async function reconcileDueShipments(limit: number, workerId: string): Promise<JsonRecord> {
    const rows = await claimShipmentsDueForTracking(workerId, limit);
    const shipments: JsonRecord[] = [];
    for (const row of rows) {
        try {
            const result = await reconcileShipment(row);
            shipments.push(result);
        } catch (error) {
            const checkedAt = new Date().toISOString();
            await updateShipment(String(row.id), {
                tracking_next_attempt_at: new Date(Date.now() + 15 * 60_000).toISOString(),
                tracking_claimed_at: null,
                tracking_claimed_by: null,
                last_error: error instanceof Error ? error.message : "tracking reconciliation failed",
            }, String(row.status)).catch(() => null);
            shipments.push({
                id: row.id,
                externalOrderId: row.external_order_id,
                expeditionNumber: row.expedition_number,
                status: row.status,
                checkedAt,
                reconciliationError: true,
            });
        }
    }
    const pendingEvents = await pendingShipmentEvents(workerId, limit);
    const events = pendingEvents.filter(event => !claimIdFromExternalOrderId(event.order_public_id)).map(projectableEvent);
    const claimReturnEvents = pendingEvents.flatMap(event => {
        const claimId = claimIdFromExternalOrderId(event.order_public_id);
        return claimId ? [projectableClaimReturnEvent(event, claimId)] : [];
    });
    return { processed: rows.length, shipments, events, claimReturnEvents };
}

export function trackingRefreshDue(row: JsonRecord): boolean {
    if (["collected_by_recipient", "lost", "returned_to_sender", "cancelled"].includes(String(row.status))) return false;
    const claimedAt = Date.parse(String(row.tracking_claimed_at ?? ""));
    if (Number.isFinite(claimedAt) && Date.now() - claimedAt < 20 * 60_000) return false;
    const nextAttemptAt = Date.parse(String(row.tracking_next_attempt_at ?? ""));
    if (Number.isFinite(nextAttemptAt) && Date.now() < nextAttemptAt) return false;
    const checkedAt = Date.parse(String(row.tracking_checked_at ?? ""));
    return !Number.isFinite(checkedAt) || Date.now() - checkedAt >= 4 * 60 * 60 * 1000;
}

function normalizedObservations(
    events: JsonRecord[],
    row: JsonRecord,
    summaryStatus: string,
    statusCode: string,
    label: string,
    checkedAt: string,
): JsonRecord[] {
    const normalized = events.filter(event => event.normalized_status && event.occurred_at).map(event => ({
        orderPublicId: row.external_order_id,
        providerEventId: event.provider_event_key,
        normalizedStatus: event.normalized_status,
        occurredAt: event.occurred_at,
        providerReference: row.expedition_number,
        ...(event.normalized_status === "carrier_accepted" ? { carrierAcceptedAt: event.occurred_at } : {}),
        ...(event.normalized_status === "collected_by_recipient" ? { recipientHandoffAt: event.occurred_at } : {}),
    }));
    if (normalized.length || !commerceStatus(summaryStatus)) return normalized;
    return [{
        orderPublicId: row.external_order_id,
        providerEventId: `mondial-relay|${row.expedition_number}|summary|${statusCode}|${fold(label)}`,
        normalizedStatus: summaryStatus,
        occurredAt: checkedAt,
        providerReference: row.expedition_number,
    }];
}

function commerceStatus(value: string): boolean {
    return [
        "carrier_accepted", "in_transit", "arrived_at_pickup_point", "available_for_pickup",
        "collected_by_recipient", "incident", "lost", "pickup_expired",
        "returning_to_sender", "returned_to_sender",
    ].includes(value);
}

function projectableEvent(event: JsonRecord): JsonRecord {
    const normalizedStatus = String(event.normalized_status ?? "");
    const occurredAt = String(event.occurred_at ?? "");
    return {
        eventId: event.id,
        claimToken: event.projection_claim_token,
        projectionAttempts: event.projection_attempts,
        orderPublicId: event.order_public_id,
        providerEventId: event.provider_event_key,
        normalizedStatus,
        occurredAt,
        providerReference: event.expedition_number,
        ...(normalizedStatus === "carrier_accepted" ? { carrierAcceptedAt: occurredAt } : {}),
        ...(normalizedStatus === "collected_by_recipient" ? { recipientHandoffAt: occurredAt } : {}),
    };
}

function projectableClaimReturnEvent(event: JsonRecord, claimId: number): JsonRecord {
    const providerStatus = String(event.normalized_status ?? "");
    const normalizedStatus = providerStatus === "collected_by_recipient" ? "recipient_handoff" : providerStatus;
    return {
        eventId: event.id,
        claimToken: event.projection_claim_token,
        projectionAttempts: event.projection_attempts,
        claimId,
        externalOrderId: event.order_public_id,
        providerEventId: event.provider_event_key,
        normalizedStatus,
        occurredAt: event.occurred_at,
        providerReference: event.expedition_number,
        providerEvidence: { provider: "mondial-relay", providerStatus },
    };
}

function claimIdFromExternalOrderId(value: unknown): number | null {
    const match = /^claim-return:([1-9][0-9]*)$/.exec(String(value ?? ""));
    if (!match) return null;
    const claimId = Number(match[1]);
    return Number.isSafeInteger(claimId) ? claimId : null;
}

function milestonePatch(observations: JsonRecord[], row: JsonRecord): JsonRecord {
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
        if (column && !row[column] && !patch[column]) patch[column] = observation.occurredAt;
    }
    return patch;
}

async function optimisticShipmentUpdate(
    row: JsonRecord,
    patch: JsonRecord,
    cancellationBlockingObservation: boolean,
): Promise<JsonRecord> {
    const id = String(row.id);
    const first = await updateShipment(id, patch, String(row.status));
    if (first) return first;
    const current = await shipmentRowById(id);
    if (!current) throw new Error("shipment disappeared during reconciliation");
    if (["cancelled_unscanned", "cancelled"].includes(String(current.status))) {
        if (cancellationBlockingObservation || cancellationCarrierActivity(String(patch.status))) {
            const retry = await updateShipment(id, {
                ...patch,
                status: "manual_review",
                last_error: "carrier activity or ambiguity raced with local shipment cancellation",
            }, String(current.status));
            return retry ?? current;
        }
        // A reconciliation that started before cancellation must never restore
        // the pre-cancellation state when its compare-and-set loses the race.
        // Keep the cancellation decision and its audit fields verbatim while
        // releasing this worker's tracking lease and recording the safe check.
        const cancellationSafePatch = { ...patch };
        delete cancellationSafePatch.status;
        delete cancellationSafePatch.last_error;
        delete cancellationSafePatch.cancellation_tracking_until;
        const retry = await updateShipment(id, cancellationSafePatch, String(current.status));
        return retry ?? current;
    }
    const safeStatus = statusAfterObservation(String(current.status), String(patch.status));
    const retry = await updateShipment(id, { ...patch, status: safeStatus }, String(current.status));
    return retry ?? current;
}

function latestProviderEvent(events: JsonRecord[]): JsonRecord | null {
    return [...events].filter(event => event.occurred_at)
        .sort((left, right) => String(left.occurred_at).localeCompare(String(right.occurred_at))).at(-1) ?? null;
}

function record(value: unknown): JsonRecord {
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function fold(value: string): string {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
