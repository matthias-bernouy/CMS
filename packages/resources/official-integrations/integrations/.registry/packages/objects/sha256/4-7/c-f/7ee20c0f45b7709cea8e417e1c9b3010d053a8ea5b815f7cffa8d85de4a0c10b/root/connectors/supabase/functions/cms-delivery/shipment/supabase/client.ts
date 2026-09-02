import { envText } from "../../env.ts";
import { HttpError } from "../../http.ts";
import type { JsonRecord } from "../types.ts";

const deliverySchema = "delivery";

export async function getOne(
    table: string,
    filters: Record<string, string>,
    select: string,
): Promise<JsonRecord | null> {
    const params = [`select=${encodeURIComponent(select)}`, "limit=1"];
    for (const [key, value] of Object.entries(filters)) {
        params.push(`${encodeURIComponent(key)}=eq.${encodeURIComponent(value)}`);
    }
    const rows = await restJson<JsonRecord[]>(`${table}?${params.join("&")}`, { method: "GET" });
    return rows[0] ?? null;
}

export async function restJson<T>(path: string, init: RequestInit): Promise<T> {
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

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
