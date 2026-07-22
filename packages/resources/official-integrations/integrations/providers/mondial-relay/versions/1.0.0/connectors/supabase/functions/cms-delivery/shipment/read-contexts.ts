import { HttpError, isRecord } from "../http.ts";
import { restJson } from "./supabase/index.ts";
import type { JsonRecord } from "./types.ts";

export type RelaySelectionContext =
    | { outcome: "selection" | "quote"; row: JsonRecord }
    | { outcome: "missing"; row: null };

export type RelaySelectionSetupContext =
    | { outcome: "shipment_exists"; settings: null }
    | { outcome: "ready"; settings: JsonRecord | null };

export type TrackingSummaryContext = {
    shipment: JsonRecord | null;
    events: JsonRecord[];
};

export async function labelAccessContext(tokenHash: string, sellerCmsUserId: string): Promise<unknown> {
    return await restJson<unknown>("rpc/get_label_access_context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_token_hash: tokenHash,
            p_seller_cms_user_id: sellerCmsUserId,
        }),
    });
}

export async function readRelaySelectionContext(
    externalOrderId: string,
    selectedForCmsUserId: string,
): Promise<RelaySelectionContext> {
    let context: unknown;
    try {
        context = await restJson<unknown>("rpc/read_relay_selection_context", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                p_external_order_id: externalOrderId,
                p_selected_for_cms_user_id: selectedForCmsUserId || null,
            }),
        });
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw invalidRelaySelectionContext();
        }
        throw error;
    }
    if (!isRecord(context)) {
        throw invalidRelaySelectionContext();
    }
    if (context.outcome === "missing" && context.row === null) {
        return { outcome: "missing", row: null };
    }
    if ((context.outcome === "selection" || context.outcome === "quote") && isRecord(context.row)) {
        return { outcome: context.outcome, row: context.row };
    }
    throw invalidRelaySelectionContext();
}

export async function readRelaySelectionSetupContext(
    externalOrderId: string,
    readSettings: boolean,
): Promise<RelaySelectionSetupContext> {
    let context: unknown;
    try {
        context = await restJson<unknown>("rpc/read_relay_selection_setup_context", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                p_external_order_id: externalOrderId,
                p_read_settings: readSettings,
            }),
        });
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw invalidRelaySelectionSetupContext();
        }
        throw error;
    }
    if (!isRecord(context)) {
        throw invalidRelaySelectionSetupContext();
    }
    if (context.outcome === "shipment_exists" && context.settings === null) {
        return { outcome: "shipment_exists", settings: null };
    }
    if (context.outcome === "ready" && (context.settings === null || isRecord(context.settings))) {
        return { outcome: "ready", settings: context.settings };
    }
    throw invalidRelaySelectionSetupContext();
}

export async function trackingSummaryContextByExpedition(expeditionNumber: string): Promise<TrackingSummaryContext> {
    const value = await restJson<unknown>("rpc/read_tracking_summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ p_expedition_number: expeditionNumber }),
    });
    const row = Array.isArray(value) && value.length === 1 ? value[0] : undefined;
    if (
        !isRecord(row) ||
        (row.shipment !== null && !isTrackingSummaryShipment(row.shipment)) ||
        !Array.isArray(row.events) ||
        !row.events.every(isTrackingSummaryEvent) ||
        (row.shipment === null && row.events.length > 0)
    ) {
        throw invalidTrackingSummaryContext();
    }
    return {
        shipment: row.shipment,
        events: row.events,
    };
}

function invalidRelaySelectionContext(): HttpError {
    return new HttpError(502, "relay selection context returned an invalid response");
}

function invalidRelaySelectionSetupContext(): HttpError {
    return new HttpError(502, "relay selection setup context returned an invalid response");
}

function isTrackingSummaryShipment(value: unknown): value is JsonRecord {
    return (
        isRecord(value) &&
        hasExactFields(value, ["id", "status", "latest_event_label", "latest_event_at"]) &&
        typeof value.id === "string" &&
        value.id.length > 0 &&
        typeof value.status === "string" &&
        isNullableString(value.latest_event_label) &&
        isNullableString(value.latest_event_at)
    );
}

function isTrackingSummaryEvent(value: unknown): value is JsonRecord {
    return (
        isRecord(value) &&
        hasExactFields(value, [
            "normalized_status",
            "occurred_at",
            "event_label",
            "event_date",
            "event_time",
            "location",
        ]) &&
        isNullableString(value.normalized_status) &&
        isNullableString(value.occurred_at) &&
        typeof value.event_label === "string" &&
        isNullableString(value.event_date) &&
        isNullableString(value.event_time) &&
        isNullableString(value.location)
    );
}

function hasExactFields(value: JsonRecord, fields: string[]): boolean {
    return Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function isNullableString(value: unknown): value is string | null {
    return value === null || typeof value === "string";
}

function invalidTrackingSummaryContext(): HttpError {
    return new HttpError(502, "tracking summary context returned an invalid response");
}
