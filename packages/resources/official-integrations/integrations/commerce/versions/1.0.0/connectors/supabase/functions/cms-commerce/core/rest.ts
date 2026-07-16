import { serviceRoleKey, requiredEnv } from "./env.ts";
import { HttpError } from "./errors.ts";
import { isRecord } from "./records.ts";
import type { JsonRecord } from "./types.ts";

const schema = "commerce";

export async function rest(path: string, init: RequestInit = {}): Promise<Response> {
    const key = serviceRoleKey();
    const base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    // Supabase's current sb_secret_* keys are not JWTs. Sending one as a
    // Bearer token makes PostgREST reject it as an invalid JWT. Legacy
    // service_role JWTs still need both headers.
    if (key.startsWith("sb_")) headers.delete("authorization");
    else headers.set("authorization", `Bearer ${key}`);
    headers.set("accept-profile", schema);
    if (init.method && init.method !== "GET" && init.method !== "HEAD") {
        headers.set("content-profile", schema);
        headers.set("content-type", "application/json");
    }
    const response = await fetch(`${base}/rest/v1/${path}`, { ...init, headers });
    if (!response.ok) throw await restError(response);
    return response;
}

export async function restJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await rest(path, init);
    return await response.json() as T;
}

export async function rpc(name: string, body: JsonRecord): Promise<unknown> {
    return await restJson(`rpc/${name}`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function one(
    table: string,
    filters: Record<string, string | number>,
    select = "*",
): Promise<JsonRecord | null> {
    const params = new URLSearchParams({ select, limit: "1" });
    for (const [key, value] of Object.entries(filters)) params.set(key, `eq.${String(value)}`);
    const rows = await restJson<JsonRecord[]>(`${table}?${params.toString()}`);
    return rows[0] ?? null;
}

export async function listRows(path: string): Promise<{ rows: JsonRecord[]; total: number }> {
    const response = await rest(path, { headers: { prefer: "count=exact" } });
    const rows = await response.json() as JsonRecord[];
    const range = response.headers.get("content-range") ?? "";
    const totalText = range.includes("/") ? range.slice(range.lastIndexOf("/") + 1) : "";
    const total = Number(totalText);
    return { rows, total: Number.isFinite(total) ? total : rows.length };
}

async function restError(response: Response): Promise<HttpError> {
    const data = await response.json().catch(() => null);
    const message = isRecord(data) && typeof data.message === "string"
        ? data.message
        : `Supabase request failed (${response.status})`;
    if (message.startsWith("validation:")) return new HttpError(422, message.slice("validation:".length).trim());
    if (message.startsWith("conflict:")) return new HttpError(409, message.slice("conflict:".length).trim());
    if (message.startsWith("forbidden:")) return new HttpError(403, message.slice("forbidden:".length).trim());
    if (message.startsWith("not_found:")) return new HttpError(404, message.slice("not_found:".length).trim());
    if (response.status === 409) return new HttpError(409, message);
    if (response.status === 400 || response.status === 422) return new HttpError(422, message);
    return new HttpError(502, message);
}
