import { requiredEnv, serviceRoleKey } from "./env.ts";
import { HttpError } from "./errors.ts";
import { isRecord } from "./records.ts";
import type { JsonRecord } from "./types.ts";

const schema = "sales_configurator";

export async function rest(path: string, init: RequestInit = {}): Promise<Response> {
    const key = serviceRoleKey();
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    if (key.startsWith("sb_")) {
        headers.delete("authorization");
    } else {
        headers.set("authorization", `Bearer ${key}`);
    }
    headers.set("accept-profile", schema);
    if (init.method && init.method !== "GET" && init.method !== "HEAD") {
        headers.set("content-profile", schema);
        headers.set("content-type", "application/json");
    }
    const base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const response = await fetch(`${base}/rest/v1/${path}`, { ...init, headers });
    if (!response.ok) {
        throw await restError(response);
    }
    return response;
}

export async function restJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await rest(path, init);
    return (await response.json()) as T;
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
    for (const [key, value] of Object.entries(filters)) {
        params.set(key, exactFilter(value));
    }
    const rows = await restJson<JsonRecord[]>(`${table}?${params.toString()}`);
    return rows[0] ?? null;
}

export function exactFilter(value: string | number): string {
    // This is a scalar query parameter, so URLSearchParams owns transport encoding.
    // PostgREST treats quotes around a simple `eq` operand as part of the value.
    return `eq.${value}`;
}

export async function listRows(path: string): Promise<{ rows: JsonRecord[]; total: number }> {
    const response = await rest(path, { headers: { prefer: "count=exact" } });
    const rows = (await response.json()) as JsonRecord[];
    const range = response.headers.get("content-range") ?? "";
    const total = Number(range.slice(range.lastIndexOf("/") + 1));
    return { rows, total: Number.isFinite(total) ? total : rows.length };
}

async function restError(response: Response): Promise<HttpError> {
    const data = await response.json().catch(() => null);
    const message =
        isRecord(data) && typeof data.message === "string"
            ? data.message
            : `Supabase request failed (${response.status})`;
    for (const [prefix, status] of [
        ["validation:", 400],
        ["conflict:", 409],
        ["forbidden:", 403],
        ["not_found:", 404],
    ] as const) {
        if (message.startsWith(prefix)) {
            return new HttpError(status, message.slice(prefix.length).trim());
        }
    }
    if (response.status === 400 || response.status === 422) {
        return new HttpError(400, message);
    }
    if (response.status === 409) {
        return new HttpError(409, message);
    }
    return new HttpError(502, message);
}
