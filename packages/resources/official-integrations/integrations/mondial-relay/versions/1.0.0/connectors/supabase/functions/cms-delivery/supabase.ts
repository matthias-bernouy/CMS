import { envText } from "./env.ts";
import { HttpError } from "./http.ts";
import type { JsonRecord } from "./types.ts";

const deliverySchema = "delivery";

export async function shipmentsRows(filters: string): Promise<JsonRecord[]> {
    return await restJson<JsonRecord[]>(`shipments?${filters}`, { method: "GET" });
}

export async function shipmentRowById(id: string): Promise<JsonRecord | null> {
    return await getOne("shipments", { id }, shipmentSelect());
}

export async function shipmentRowByExpedition(expeditionNumber: string): Promise<JsonRecord | null> {
    return await getOne("shipments", { expedition_number: expeditionNumber }, shipmentSelect());
}

export async function shipmentEvents(shipmentId: string): Promise<JsonRecord[]> {
    return await restJson<JsonRecord[]>(
        `shipment_events?shipment_id=eq.${encodeURIComponent(shipmentId)}&select=${encodeURIComponent("id,shipment_id,expedition_number,event_label,event_date,event_time,location,relay_number,relay_country,created_at")}&order=created_at.desc`,
        { method: "GET" },
    );
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

export async function insertShipment(row: JsonRecord): Promise<JsonRecord> {
    const rows = await restJson<JsonRecord[]>("shipments", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "return=representation",
        },
        body: JSON.stringify(row),
    });
    return rows[0] ?? row;
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
        "expedition_number",
        "tracking_number",
        "status",
        "label_url",
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
        "package_count",
        "length_cm",
        "size_code",
        "insurance_level",
        "instructions",
        "latest_event_label",
        "latest_event_at",
        "metadata",
        "raw_response",
        "created_at",
        "updated_at",
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

async function restJson<T>(path: string, init: RequestInit): Promise<T> {
    const response = await rest(path, init);
    const text = await response.text();
    return text ? JSON.parse(text) as T : undefined as T;
}

async function rest(path: string, init: RequestInit): Promise<Response> {
    const base = envText("SUPABASE_URL");
    const key = supabaseDataApiKey();
    if (!base || !key) throw new HttpError(500, "Supabase service credentials are not configured");
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("authorization", `Bearer ${key}`);
    headers.set("accept-profile", deliverySchema);
    if (init.method && init.method !== "GET") headers.set("content-profile", deliverySchema);
    const response = await fetch(`${base}/rest/v1/${path}`, { ...init, headers });
    if (response.ok) return response;
    const detail = await response.text().catch(() => "");
    throw new HttpError(502, `Supabase Data API request failed (${response.status})${detail ? `: ${detail}` : ""}`);
}

function supabaseDataApiKey(): string {
    return supabaseSecretKeys()[0] ?? "";
}

function supabaseSecretKeys(): string[] {
    const keys: string[] = [];
    const secretKeys = envText("SUPABASE_SECRET_KEYS");
    if (secretKeys) {
        if (!secretKeys.startsWith("{")) {
            keys.push(...secretKeys.split(",").map(value => value.trim()).filter(Boolean));
        } else {
            try {
                const parsed = JSON.parse(secretKeys);
                if (isRecord(parsed)) {
                    if (typeof parsed.default === "string" && parsed.default) keys.push(parsed.default);
                    for (const value of Object.values(parsed)) {
                        if (typeof value === "string" && value && value !== parsed.default) keys.push(value);
                    }
                }
            } catch {
                throw new HttpError(500, "SUPABASE_SECRET_KEYS must be valid JSON");
            }
        }
    }

    const modernSecretKey = envText("SUPABASE_SECRET_KEY");
    if (modernSecretKey) keys.push(modernSecretKey);
    const legacyServiceRoleKey = envText("SUPABASE_SERVICE_ROLE_KEY");
    if (legacyServiceRoleKey) keys.push(legacyServiceRoleKey);

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
