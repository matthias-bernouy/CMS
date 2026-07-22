import { envText } from "../env.ts";
import { HttpError } from "../http.ts";
import type { JsonRecord } from "./types.ts";

const deliverySchema = "delivery";

export type RelaySelectionContext =
    | { outcome: "selection" | "quote"; row: JsonRecord }
    | { outcome: "missing"; row: null };

export async function shipmentsRows(filters: string): Promise<JsonRecord[]> {
    return await restJson<JsonRecord[]>(`shipments?${filters}`, { method: "GET" });
}

export async function shipmentRowById(id: string): Promise<JsonRecord | null> {
    return await getOne("shipments", { id }, shipmentSelect());
}

export async function shipmentRowByExpedition(expeditionNumber: string): Promise<JsonRecord | null> {
    return await getOne("shipments", { expedition_number: expeditionNumber }, shipmentSelect());
}

export async function shipmentWithEventsRowById(id: string): Promise<JsonRecord | null> {
    return await shipmentWithEventsRow({ id });
}

export async function shipmentWithEventsRowByExpedition(expeditionNumber: string): Promise<JsonRecord | null> {
    return await shipmentWithEventsRow({ expedition_number: expeditionNumber });
}

export async function shipmentWithEventsRowByExternalOrderId(externalOrderId: string): Promise<JsonRecord | null> {
    return await shipmentWithEventsRow(
        { external_order_id: externalOrderId },
        { newestFirst: true, shipmentFields: shipmentTrackingSelect() },
    );
}

export async function shipmentRowByExternalOrderId(externalOrderId: string): Promise<JsonRecord | null> {
    return await getOne("shipments", { external_order_id: externalOrderId }, shipmentSelect());
}

export async function shipmentEvents(shipmentId: string): Promise<JsonRecord[]> {
    return await restJson<JsonRecord[]>(
        `shipment_events?shipment_id=eq.${encodeURIComponent(shipmentId)}&select=${encodeURIComponent(eventSelect())}&order=occurred_at.desc.nullslast,created_at.desc`,
        { method: "GET" },
    );
}

export type TrackingSummaryContext = {
    shipment: JsonRecord | null;
    events: JsonRecord[];
};

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

export async function claimShipmentsDueForTracking(workerId: string, limit: number): Promise<JsonRecord[]> {
    return await restJson<JsonRecord[]>("rpc/claim_due_shipments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ p_worker_id: workerId, p_limit: limit }),
    });
}

export async function upsertShipmentEvents(rows: JsonRecord[]): Promise<void> {
    if (!rows.length) {
        return;
    }
    await restJson<JsonRecord[]>("shipment_events?on_conflict=shipment_id,provider_event_key", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(rows),
    });
}

export async function pendingShipmentEvents(workerId: string, limit: number): Promise<JsonRecord[]> {
    return await restJson<JsonRecord[]>("rpc/claim_pending_shipment_events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_worker_id: workerId,
            p_limit: limit,
            p_lease_seconds: 300,
            p_max_attempts: 5,
        }),
    });
}

export async function acknowledgeShipmentEvent(eventId: number, claimToken: string): Promise<boolean> {
    return await restJson<boolean>("rpc/complete_shipment_event_projection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ p_event_id: eventId, p_claim_token: claimToken }),
    });
}

export async function failShipmentEventProjection(
    eventId: number,
    claimToken: string,
    error: string,
): Promise<JsonRecord> {
    return await restJson<JsonRecord>("rpc/fail_shipment_event_projection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_event_id: eventId,
            p_claim_token: claimToken,
            p_error: error.slice(0, 2000),
            p_retry_delay_seconds: 60,
            p_max_attempts: 5,
        }),
    });
}

export async function shipmentProjectionExceptionRows(limit: number, offset: number): Promise<JsonRecord[]> {
    return await restJson<JsonRecord[]>(
        `shipment_events?projection_status=in.(retry_wait,manual_review)` +
            `&select=${encodeURIComponent(eventSelect())}&order=projection_manual_review_at.desc.nullslast,created_at.asc,id.asc` +
            `&limit=${limit}&offset=${offset}`,
        { method: "GET" },
    );
}

export async function issueLabelAccessToken(
    externalOrderId: string,
    sellerCmsUserId: string,
    tokenHash: string,
    expiresAt: string,
): Promise<JsonRecord> {
    return await restJson<JsonRecord>("rpc/issue_label_access_token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_external_order_id: externalOrderId,
            p_seller_cms_user_id: sellerCmsUserId,
            p_token_hash: tokenHash,
            p_expires_at: expiresAt,
        }),
    });
}

export async function declareSellerHandoffRow(externalOrderId: string, sellerCmsUserId: string): Promise<JsonRecord> {
    return await restJson<JsonRecord>("rpc/declare_seller_handoff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_external_order_id: externalOrderId,
            p_seller_cms_user_id: sellerCmsUserId,
        }),
    });
}

export async function insertShipmentRecoveryEvent(row: JsonRecord): Promise<void> {
    await restJson<JsonRecord[]>("shipment_recovery_events", {
        method: "POST",
        headers: { "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify(row),
    });
}

export async function labelAccessContext(
    tokenHash: string,
    sellerCmsUserId: string,
    observedAt: string,
): Promise<unknown> {
    return await restJson<unknown>("rpc/get_label_access_context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_token_hash: tokenHash,
            p_seller_cms_user_id: sellerCmsUserId,
            p_observed_at: observedAt,
        }),
    });
}

export async function deliveryQuoteRow(quoteId: string): Promise<JsonRecord | null> {
    return await getOne("delivery_quotes", { quote_id: quoteId }, deliveryQuoteSelect(true));
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

function invalidRelaySelectionContext(): HttpError {
    return new HttpError(502, "relay selection context returned an invalid response");
}

export async function reserveDeliveryQuote(row: JsonRecord): Promise<JsonRecord> {
    return await restJson<JsonRecord>("rpc/reserve_delivery_quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(row),
    });
}

export async function reserveShipmentCreation(input: {
    reservation: JsonRecord;
    quoteCheck: JsonRecord;
    quotePurpose: string;
    quoteExternalOrderId: string;
    selectedForCmsUserId: string;
    observedAt: string;
}): Promise<JsonRecord> {
    return await restJson<JsonRecord>("rpc/reserve_shipment_creation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_reservation: input.reservation,
            p_quote_check: input.quoteCheck,
            p_quote_purpose: input.quotePurpose,
            p_quote_external_order_id: input.quoteExternalOrderId,
            p_selected_for_cms_user_id: input.selectedForCmsUserId,
            p_observed_at: input.observedAt,
        }),
    });
}

export async function markStaleShipmentCreationsUnknown(limit: number): Promise<JsonRecord[]> {
    return await restJson<JsonRecord[]>("rpc/mark_stale_shipment_creations_unknown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ p_limit: limit, p_stale_seconds: 1200 }),
    });
}

export async function cancelShipmentUnscanned(externalOrderId: string, trackingUntil: string): Promise<JsonRecord> {
    return await restJson<JsonRecord>("rpc/cancel_shipment_unscanned", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ p_external_order_id: externalOrderId, p_tracking_until: trackingUntil }),
    });
}

export async function projectionHealth(): Promise<JsonRecord> {
    return await restJson<JsonRecord>("rpc/get_projection_health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
    });
}

export async function reviewShipmentEventProjection(
    eventId: number,
    action: string,
    actorCmsUserId: string,
    reason: string,
): Promise<JsonRecord> {
    return await restJson<JsonRecord>("rpc/review_shipment_event_projection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_event_id: eventId,
            p_action: action,
            p_actor_cms_user_id: actorCmsUserId,
            p_reason: reason,
        }),
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

export async function updateShipment(
    id: string,
    patch: JsonRecord,
    expectedStatus?: string,
): Promise<JsonRecord | null> {
    const filters = [`id=eq.${encodeURIComponent(id)}`];
    if (expectedStatus) {
        filters.push(`status=eq.${encodeURIComponent(expectedStatus)}`);
    }
    const rows = await restJson<JsonRecord[]>(
        `shipments?${filters.join("&")}&select=${encodeURIComponent(shipmentSelect())}`,
        {
            method: "PATCH",
            headers: {
                "content-type": "application/json",
                prefer: "return=representation",
            },
            body: JSON.stringify(patch),
        },
    );
    return rows[0] ?? null;
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

function eventSelect(): string {
    return [
        "id",
        "shipment_id",
        "order_public_id",
        "expedition_number",
        "provider_event_key",
        "normalized_status",
        "occurred_at",
        "commerce_projected_at",
        "projection_status",
        "projection_attempts",
        "projection_next_attempt_at",
        "projection_claimed_at",
        "projection_claimed_by",
        "projection_claim_token",
        "projection_last_error",
        "projection_manual_review_at",
        "event_label",
        "event_date",
        "event_time",
        "location",
        "relay_number",
        "relay_country",
        "created_at",
    ].join(",");
}

async function shipmentWithEventsRow(
    filters: Record<string, string>,
    options: { newestFirst?: boolean; shipmentFields?: string } = {},
): Promise<JsonRecord | null> {
    const select =
        `${options.shipmentFields ?? shipmentSelect()},` +
        `events:shipment_events!shipment_events_shipment_id_fkey(${shipmentDetailEventSelect()})`;
    const params = [`select=${encodeURIComponent(select)}`, "limit=1"];
    for (const [key, value] of Object.entries(filters)) {
        params.push(`${encodeURIComponent(key)}=eq.${encodeURIComponent(value)}`);
    }
    if (options.newestFirst) {
        params.push(`order=${encodeURIComponent("created_at.desc")}`);
    }
    params.push(`events.order=${encodeURIComponent("occurred_at.desc.nullslast,created_at.desc")}`);
    const rows = await restJson<JsonRecord[]>(`shipments?${params.join("&")}`, { method: "GET" });
    return rows[0] ?? null;
}

function shipmentTrackingSelect(): string {
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

function shipmentDetailEventSelect(): string {
    return ["normalized_status", "occurred_at", "event_label", "event_date", "event_time", "location"].join(",");
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

async function getOne(table: string, filters: Record<string, string>, select: string): Promise<JsonRecord | null> {
    const params = [`select=${encodeURIComponent(select)}`, "limit=1"];
    for (const [key, value] of Object.entries(filters)) {
        params.push(`${encodeURIComponent(key)}=eq.${encodeURIComponent(value)}`);
    }
    const rows = await restJson<JsonRecord[]>(`${table}?${params.join("&")}`, { method: "GET" });
    return rows[0] ?? null;
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

async function restJson<T>(path: string, init: RequestInit): Promise<T> {
    const response = await rest(path, init);
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function rest(path: string, init: RequestInit): Promise<Response> {
    const base = envText("SUPABASE_URL");
    const key = supabaseDataApiKey();
    if (!base || !key) {
        throw new HttpError(500, "Supabase service credentials are not configured");
    }
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    if (key.startsWith("sb_")) {
        headers.delete("authorization");
    } else {
        headers.set("authorization", `Bearer ${key}`);
    }
    headers.set("accept-profile", deliverySchema);
    if (init.method && init.method !== "GET") {
        headers.set("content-profile", deliverySchema);
    }
    const response = await fetch(`${base}/rest/v1/${path}`, { ...init, headers });
    if (response.ok) {
        return response;
    }
    const detail = await response.text().catch(() => "");
    throw dataApiError(response.status, detail);
}

export function dataApiError(status: number, detail: string): HttpError {
    const message = postgresMessage(detail);
    if (message.startsWith("not_found: ")) {
        return new HttpError(404, message.slice("not_found: ".length));
    }
    if (message.startsWith("conflict: ")) {
        return new HttpError(409, message.slice("conflict: ".length));
    }
    if (message.startsWith("validation: ")) {
        return new HttpError(400, message.slice("validation: ".length));
    }
    return new HttpError(502, `Supabase Data API request failed (${status})`);
}

function postgresMessage(detail: string): string {
    if (!detail) {
        return "";
    }
    try {
        const parsed = JSON.parse(detail) as JsonRecord;
        return typeof parsed.message === "string" ? parsed.message : "";
    } catch {
        return "";
    }
}

function supabaseDataApiKey(): string {
    return supabaseSecretKeys()[0] ?? "";
}

function supabaseSecretKeys(): string[] {
    const keys: string[] = [];
    const secretKeys = envText("SUPABASE_SECRET_KEYS");
    if (secretKeys) {
        if (!secretKeys.startsWith("{")) {
            keys.push(
                ...secretKeys
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
            );
        } else {
            try {
                const parsed = JSON.parse(secretKeys);
                if (isRecord(parsed)) {
                    if (typeof parsed.default === "string" && parsed.default) {
                        keys.push(parsed.default);
                    }
                    for (const value of Object.values(parsed)) {
                        if (typeof value === "string" && value && value !== parsed.default) {
                            keys.push(value);
                        }
                    }
                }
            } catch {
                throw new HttpError(500, "SUPABASE_SECRET_KEYS must be valid JSON");
            }
        }
    }

    const modernSecretKey = envText("SUPABASE_SECRET_KEY");
    if (modernSecretKey) {
        keys.push(modernSecretKey);
    }
    const legacyServiceRoleKey = envText("SUPABASE_SERVICE_ROLE_KEY");
    if (legacyServiceRoleKey) {
        keys.push(legacyServiceRoleKey);
    }

    return [...new Set(keys)];
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

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
