import { connectSchema, requiredEnv, serviceRoleKey } from "../config/runtime.ts";
import { HttpError } from "../http/errors.ts";
import { isRecord, stripUndefined } from "../shared/data.ts";
import type { JsonRecord } from "../shared/types.ts";

export async function rest(path: string, init: RequestInit): Promise<Response> {
    const key = serviceRoleKey();
    const base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("authorization", `Bearer ${key}`);
    headers.set("accept-profile", connectSchema);
    if (init.method && init.method !== "GET") {
        headers.set("content-profile", connectSchema);
    }
    return fetch(`${base}/rest/v1/${path}`, { ...init, headers });
}

export async function restError(response: Response): Promise<HttpError> {
    const data = await response.json().catch(() => null);
    const message =
        isRecord(data) && typeof data.message === "string"
            ? data.message
            : `Supabase request failed (${response.status})`;
    if (message.startsWith("validation:")) {
        return new HttpError(400, message.slice("validation:".length).trim());
    }
    if (message.startsWith("not_found:")) {
        return new HttpError(404, message.slice("not_found:".length).trim());
    }
    if (message.startsWith("conflict:")) {
        return new HttpError(409, message.slice("conflict:".length).trim());
    }
    if (message.startsWith("forbidden:")) {
        return new HttpError(403, message.slice("forbidden:".length).trim());
    }
    return new HttpError(502, message);
}

export async function insertRow<T>(table: string, select: string, values: JsonRecord): Promise<T> {
    const response = await rest(`${table}?select=${encodeURIComponent(select)}`, {
        method: "POST",
        headers: { "content-type": "application/json", prefer: "return=representation" },
        body: JSON.stringify(stripUndefined(values)),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    return firstRow<T>(await response.json());
}

export async function upsertRow<T>(
    table: string,
    conflictField: string,
    select: string,
    values: JsonRecord,
): Promise<T> {
    const response = await rest(
        `${table}?on_conflict=${encodeURIComponent(conflictField)}&select=${encodeURIComponent(select)}`,
        {
            method: "POST",
            headers: {
                "content-type": "application/json",
                prefer: "resolution=merge-duplicates,return=representation",
            },
            body: JSON.stringify(stripUndefined(values)),
        },
    );
    if (!response.ok) {
        throw await restError(response);
    }
    return firstRow<T>(await response.json());
}

export async function updateRow<T = JsonRecord>(
    table: string,
    id: number,
    values: JsonRecord,
    select = "*",
): Promise<T | null> {
    const response = await rest(`${table}?id=eq.${id}&select=${encodeURIComponent(select)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", prefer: "return=representation" },
        body: JSON.stringify(stripUndefined(values)),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    const rows = (await response.json()) as T[];
    return rows[0] ?? null;
}

export async function getRowByField<T>(table: string, field: string, value: string, select: string): Promise<T | null> {
    const response = await rest(
        `${table}?${field}=eq.${encodeURIComponent(value)}&select=${encodeURIComponent(select)}&limit=1`,
        { method: "GET" },
    );
    if (!response.ok) {
        throw await restError(response);
    }
    const rows = (await response.json()) as T[];
    return rows[0] ?? null;
}

export async function listRows<T>(path: string): Promise<T[]> {
    const response = await rest(path, { method: "GET" });
    if (!response.ok) {
        throw await restError(response);
    }
    return (await response.json()) as T[];
}

export async function callRpcRows<T>(name: string, body: JsonRecord): Promise<T[]> {
    const response = await rest(`rpc/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    return (await response.json()) as T[];
}

export async function callRpcObject<T>(name: string, body: JsonRecord): Promise<T> {
    const response = await rest(`rpc/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    const value = await response.json();
    return (isRecord(value) ? value : firstRow<T>(value)) as T;
}

export function firstRow<T>(value: unknown): T {
    if (!Array.isArray(value) || !value[0]) {
        throw new HttpError(502, "Supabase returned no rows");
    }
    return value[0] as T;
}
