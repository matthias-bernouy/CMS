import { expect } from "bun:test";
import {
    embeddedFields,
    nullableTimestampDescending,
    projectRecord,
    projectRows,
    selectedFields,
    timestamp,
} from "../../projection.ts";
import { jsonResponse } from "../../responses.ts";
import type { JsonRecord } from "../../runtime.ts";
import { supabaseUrl } from "../../runtime.ts";
import type { RouterContext } from "../types.ts";

export function handleShipmentReads(context: RouterContext): Response | undefined {
    const { method, requestBody, state, url } = context;
    const { insertedShipments, shipmentEvents } = state;
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/shipments" && method === "GET") {
        const fields = selectedFields(url);
        expect(fields).not.toContain("shipping_amount");
        expect(fields).not.toContain("currency");
        const id = url.searchParams.get("id")?.replace(/^eq\./, "");
        const externalOrderId = url.searchParams.get("external_order_id")?.replace(/^eq\./, "");
        const expeditionNumber = url.searchParams.get("expedition_number")?.replace(/^eq\./, "");
        const rows = insertedShipments.filter(
            (row) =>
                (!id || row.id === id) &&
                (!externalOrderId || row.external_order_id === externalOrderId) &&
                (!expeditionNumber || row.expedition_number === expeditionNumber),
        );
        if (url.searchParams.get("order") === "created_at.desc") {
            rows.sort((left, right) => timestamp(right.created_at) - timestamp(left.created_at));
        }
        const projected = projectRows(url, rows.slice(0, Number(url.searchParams.get("limit") ?? rows.length)));
        const eventFields = embeddedFields(fields, "events:shipment_events");
        if (eventFields.length) {
            for (const [index, row] of rows.entries()) {
                if (!projected[index]) {
                    break;
                }
                projected[index]!.events = shipmentEvents
                    .filter((event) => event.shipment_id === row.id)
                    .sort((left, right) => {
                        const occurred = nullableTimestampDescending(left.occurred_at, right.occurred_at);
                        return occurred || timestamp(right.created_at) - timestamp(left.created_at);
                    })
                    .map((event) => projectRecord(event, eventFields));
            }
        }
        return jsonResponse(projected, 200);
    }
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/rpc/read_tracking_summary" && method === "POST") {
        const body = JSON.parse(requestBody) as JsonRecord;
        const row = insertedShipments.find((shipment) => shipment.expedition_number === body.p_expedition_number);
        if (!row) {
            return jsonResponse([{ shipment: null, events: [] }], 200);
        }
        const events = shipmentEvents
            .filter((event) => event.shipment_id === row.id)
            .sort((left, right) => {
                const occurred = nullableTimestampDescending(left.occurred_at, right.occurred_at);
                return occurred || timestamp(right.created_at) - timestamp(left.created_at);
            })
            .map((event) => ({
                normalized_status: event.normalized_status ?? null,
                occurred_at: event.occurred_at ?? null,
                event_label: event.event_label,
                event_date: event.event_date ?? null,
                event_time: event.event_time ?? null,
                location: event.location ?? null,
            }));
        return jsonResponse(
            [
                {
                    shipment: {
                        id: row.id,
                        status: row.status,
                        latest_event_label: row.latest_event_label ?? null,
                        latest_event_at: row.latest_event_at ?? null,
                    },
                    events,
                },
            ],
            200,
        );
    }
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/rpc/claim_due_shipments" && method === "POST") {
        const body = JSON.parse(requestBody) as JsonRecord;
        const workerId = String(body.p_worker_id ?? "");
        const limit = Number(body.p_limit ?? 24);
        expect(workerId.length).toBeGreaterThan(0);
        const due = insertedShipments
            .filter(
                (row) =>
                    Boolean(row.expedition_number) &&
                    !row.tracking_claimed_at &&
                    !row.tracking_checked_at &&
                    !["collected_by_recipient", "lost", "returned_to_sender", "cancelled"].includes(String(row.status)),
            )
            .slice(0, limit);
        for (const row of due) {
            Object.assign(row, {
                tracking_claimed_at: "2026-07-12T11:00:00.000Z",
                tracking_claimed_by: workerId,
            });
        }
        return jsonResponse(due, 200);
    }
    if (
        url.origin === supabaseUrl &&
        url.pathname === "/rest/v1/rpc/mark_stale_shipment_creations_unknown" &&
        method === "POST"
    ) {
        const limit = Number((JSON.parse(requestBody) as JsonRecord).p_limit ?? 24);
        const rows = insertedShipments
            .filter(
                (row) =>
                    row.status === "creating" &&
                    Date.parse(String(row.provider_call_started_at ?? "")) <= Date.now() - 20 * 60_000,
            )
            .slice(0, limit);
        for (const row of rows) {
            Object.assign(row, {
                status: "unknown",
                creation_manual_review_at: "2026-07-13T12:00:00.000Z",
                last_error: "shipment creation lease expired before a provider outcome was attached",
            });
        }
        return jsonResponse(rows, 200);
    }
    return undefined;
}
