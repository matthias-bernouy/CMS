import { projectRows, shipmentReservationError, stableJson } from "../../projection.ts";
import { jsonResponse } from "../../responses.ts";
import type { JsonRecord } from "../../runtime.ts";
import { supabaseUrl } from "../../runtime.ts";
import type { RouterContext } from "../types.ts";

export function handleShipmentCreation(context: RouterContext): Response | undefined {
    const { method, options, request, requestBody, state, url } = context;
    const { deliveryQuotes, insertedShipments, relaySelections } = state;
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/rpc/reserve_shipment_creation" && method === "POST") {
        const body = JSON.parse(requestBody) as JsonRecord;
        const reservation = body.p_reservation as JsonRecord;
        const validationError = shipmentReservationError(body, deliveryQuotes, relaySelections);
        if (validationError) {
            return jsonResponse({ message: `conflict: ${validationError}` }, 409);
        }
        const existing = insertedShipments.find((row) => row.idempotency_key === reservation.idempotency_key);
        if (existing) {
            if (stableJson(existing.raw_request) !== stableJson(reservation.raw_request)) {
                return jsonResponse(
                    {
                        message: "conflict: idempotency key was already used with a different shipment payload",
                    },
                    409,
                );
            }
            if (existing.status === "failed") {
                const { id: _id, idempotency_key: _key, ...retryReservation } = reservation;
                Object.assign(existing, retryReservation, {
                    status: "creating",
                    last_error: null,
                    updated_at: "2026-07-02T10:05:00.000Z",
                });
                return jsonResponse({ outcome: "provider_required", shipment: existing }, 200);
            }
            if (existing.status === "creating") {
                return jsonResponse({ outcome: "creating", shipment: existing }, 200);
            }
            if (existing.status === "unknown") {
                return jsonResponse({ outcome: "unknown", shipment: existing }, 200);
            }
            return jsonResponse({ outcome: "replay", shipment: existing }, 200);
        }
        const stored = {
            ...reservation,
            created_at: "2026-07-02T10:00:00.000Z",
            updated_at: "2026-07-02T10:00:00.000Z",
        };
        insertedShipments.push(stored);
        return jsonResponse({ outcome: "provider_required", shipment: stored }, 200);
    }
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/shipments" && method === "POST") {
        const row = JSON.parse(requestBody) as JsonRecord;
        const duplicate = insertedShipments.some((item) => item.idempotency_key === row.idempotency_key);
        if (duplicate && request.headers.get("prefer")?.includes("resolution=ignore-duplicates")) {
            return jsonResponse([], 200);
        }
        const stored = {
            ...row,
            created_at: "2026-07-02T10:00:00.000Z",
            updated_at: "2026-07-02T10:00:00.000Z",
        };
        insertedShipments.push(stored);
        return jsonResponse(projectRows(url, [stored]), 201);
    }
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/shipments" && method === "PATCH") {
        const patch = JSON.parse(requestBody) as JsonRecord;
        const id = url.searchParams.get("id")?.replace(/^eq\./, "");
        const status = url.searchParams.get("status")?.replace(/^eq\./, "");
        const isShipmentLeaseExpiry =
            status === "creating" &&
            patch.status === "unknown" &&
            patch.last_error === "shipment creation lease expired before a provider outcome was attached";
        if (isShipmentLeaseExpiry && options.shipmentLeasePatchFailure) {
            return jsonResponse({ message: "private shipment lease update failure" }, 500);
        }
        if (isShipmentLeaseExpiry && options.shipmentLeasePatchMiss) {
            return jsonResponse([], 200);
        }
        if (
            !state.cancellationRaceInjected &&
            options.cancellationRaceOnReconciliation &&
            patch.tracking_checked_at &&
            id
        ) {
            const racingRow = insertedShipments.find((item) => item.id === id && item.status === status);
            if (racingRow) {
                Object.assign(racingRow, {
                    status: options.cancellationRaceOnReconciliation,
                    cancellation_tracking_until: "2099-07-12T09:30:00.000Z",
                    last_error: "cancellation committed during reconciliation",
                });
                state.cancellationRaceInjected = true;
            }
        }
        const index = insertedShipments.findIndex(
            (item) => (!id || item.id === id) && (!status || item.status === status),
        );
        if (index < 0) {
            return jsonResponse([], 200);
        }
        const stored = {
            ...insertedShipments[index],
            ...patch,
            updated_at: "2026-07-02T10:05:00.000Z",
        };
        insertedShipments[index] = stored;
        return jsonResponse(projectRows(url, [stored]), 200);
    }
    return undefined;
}
