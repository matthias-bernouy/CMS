import { claimShipmentsDueForTracking, pendingShipmentEvents, updateShipment } from "../supabase/index.ts";
import type { JsonRecord } from "../types.ts";
import { claimIdFromExternalOrderId, projectableClaimReturnEvent, projectableEvent } from "./projection-events.ts";
import { reconcileShipment } from "./shipment.ts";

export async function reconcileDueShipments(limit: number, workerId: string): Promise<JsonRecord> {
    const rows = await claimShipmentsDueForTracking(workerId, limit);
    const shipments: JsonRecord[] = [];
    for (const row of rows) {
        try {
            const result = await reconcileShipment(row);
            shipments.push(result);
        } catch (error) {
            const checkedAt = new Date().toISOString();
            await updateShipment(
                String(row.id),
                {
                    tracking_next_attempt_at: new Date(Date.now() + 15 * 60_000).toISOString(),
                    tracking_claimed_at: null,
                    tracking_claimed_by: null,
                    last_error: error instanceof Error ? error.message : "tracking reconciliation failed",
                },
                String(row.status),
            ).catch(() => null);
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
    const events = pendingEvents
        .filter((event) => !claimIdFromExternalOrderId(event.order_public_id))
        .map(projectableEvent);
    const claimReturnEvents = pendingEvents.flatMap((event) => {
        const claimId = claimIdFromExternalOrderId(event.order_public_id);
        return claimId ? [projectableClaimReturnEvent(event, claimId)] : [];
    });
    return { processed: rows.length, shipments, events, claimReturnEvents };
}
