import { serviceRoleKey } from "./env.ts";
import { HttpError, type JsonRecord } from "./types.ts";

const schema = "broadcast";

export async function rest(path: string, init: RequestInit): Promise<Response> {
    const key = serviceRoleKey();
    const base = required("SUPABASE_URL").replace(/\/$/, "");
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("authorization", `Bearer ${key}`);
    headers.set("accept-profile", schema);
    if (init.method && init.method !== "GET") headers.set("content-profile", schema);
    return fetch(`${base}/rest/v1/${path}`, { ...init, headers });
}

export async function restJson<T>(path: string, init: RequestInit): Promise<T> {
    const response = await rest(path, init);
    if (!response.ok) throw await restError(response);
    return await response.json() as T;
}

export async function firstRow<T>(path: string, init: RequestInit): Promise<T> {
    const rows = await restJson<T[]>(path, init);
    if (!Array.isArray(rows) || !rows[0]) throw new HttpError(502, "Supabase returned no rows");
    return rows[0];
}

export async function restError(response: Response): Promise<HttpError> {
    const data = await response.json().catch(() => null);
    const message = isRecord(data) && typeof data.message === "string"
        ? data.message
        : `Supabase request failed (${response.status})`;
    return new HttpError(502, message);
}

export function countFromContentRange(value: string | null): number | null {
    const total = value?.split("/")[1];
    if (!total || total === "*") return null;
    const parsed = Number(total);
    return Number.isFinite(parsed) ? parsed : null;
}

export function qs(values: Record<string, string | number | undefined>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        if (value !== undefined && value !== "") params.set(key, String(value));
    }
    return params.toString();
}

function required(name: string): string {
    const value = Deno.env.get(name);
    if (!value) throw new HttpError(500, `missing ${name}`);
    return value;
}

function isRecord(value: unknown): value is JsonRecord {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
