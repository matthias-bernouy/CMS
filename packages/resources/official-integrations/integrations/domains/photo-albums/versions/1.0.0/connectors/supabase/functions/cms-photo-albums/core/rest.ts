import { requiredEnv, serviceRoleKey } from "./env.ts";
import { HttpError } from "./errors.ts";
import { isRecord, type JsonRecord } from "./records.ts";

const schema = "photo_albums";

export async function rpc(name: string, body: JsonRecord = {}): Promise<unknown> {
    const response = await rest(`rpc/${name}`, {
        method: "POST",
        body: JSON.stringify(body),
    });
    return await response.json();
}

export async function rpcRecord(name: string, body: JsonRecord = {}): Promise<JsonRecord> {
    const value = await rpc(name, body);
    if (!isRecord(value)) {
        throw new HttpError(502, `${name} returned an invalid response`);
    }
    return value;
}

export async function one(
    table: string,
    filters: Record<string, string | number>,
    select = "*",
): Promise<JsonRecord | null> {
    const params = new URLSearchParams({ select, limit: "1" });
    for (const [key, value] of Object.entries(filters)) {
        params.set(key, `eq.${String(value)}`);
    }
    const response = await rest(`${table}?${params}`);
    const rows = (await response.json()) as unknown;
    return Array.isArray(rows) && isRecord(rows[0]) ? rows[0] : null;
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
    const key = serviceRoleKey();
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    if (!key.startsWith("sb_")) {
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

async function restError(response: Response): Promise<HttpError> {
    const body = await response.json().catch(() => null);
    const message =
        isRecord(body) && typeof body.message === "string"
            ? body.message
            : `Supabase request failed (${response.status})`;
    const prefix = /^(validation|conflict|forbidden|not_found):\s*/.exec(message)?.[1];
    if (prefix === "validation") {
        return new HttpError(422, message.replace(/^[^:]+:\s*/, ""));
    }
    if (prefix === "conflict") {
        return new HttpError(409, message.replace(/^[^:]+:\s*/, ""));
    }
    if (prefix === "forbidden") {
        return new HttpError(403, message.replace(/^[^:]+:\s*/, ""));
    }
    if (prefix === "not_found") {
        return new HttpError(404, message.replace(/^[^:]+:\s*/, ""));
    }
    return new HttpError(response.status < 500 ? 422 : 502, message);
}
