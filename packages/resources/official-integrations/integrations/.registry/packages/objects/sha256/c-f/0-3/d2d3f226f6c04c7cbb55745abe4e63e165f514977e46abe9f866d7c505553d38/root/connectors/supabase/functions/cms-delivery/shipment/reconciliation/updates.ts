import { statusAfterObservation } from "../../provider/tracking-status/index.ts";
import { shipmentRowById, updateShipment } from "../supabase/index.ts";
import type { JsonRecord } from "../types.ts";
import { cancellationCarrierActivity } from "./observations.ts";

export function trackingRefreshDue(row: JsonRecord): boolean {
    if (["collected_by_recipient", "lost", "returned_to_sender", "cancelled"].includes(String(row.status))) {
        return false;
    }
    const claimedAt = Date.parse(String(row.tracking_claimed_at ?? ""));
    if (Number.isFinite(claimedAt) && Date.now() - claimedAt < 20 * 60_000) {
        return false;
    }
    const nextAttemptAt = Date.parse(String(row.tracking_next_attempt_at ?? ""));
    if (Number.isFinite(nextAttemptAt) && Date.now() < nextAttemptAt) {
        return false;
    }
    const checkedAt = Date.parse(String(row.tracking_checked_at ?? ""));
    return !Number.isFinite(checkedAt) || Date.now() - checkedAt >= 4 * 60 * 60 * 1000;
}

export async function optimisticShipmentUpdate(
    row: JsonRecord,
    patch: JsonRecord,
    cancellationBlockingObservation: boolean,
): Promise<JsonRecord> {
    const id = String(row.id);
    const first = await updateShipment(id, patch, String(row.status));
    if (first) {
        return first;
    }
    const current = await shipmentRowById(id);
    if (!current) {
        throw new Error("shipment disappeared during reconciliation");
    }
    if (["cancelled_unscanned", "cancelled"].includes(String(current.status))) {
        if (cancellationBlockingObservation || cancellationCarrierActivity(String(patch.status))) {
            const retry = await updateShipment(
                id,
                {
                    ...patch,
                    status: "manual_review",
                    last_error: "carrier activity or ambiguity raced with local shipment cancellation",
                },
                String(current.status),
            );
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
