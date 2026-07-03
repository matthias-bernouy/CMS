import { HttpError } from "./errors.ts";
import { requiredEnv, serviceRoleKey } from "./env.ts";
import { isRecord } from "./records.ts";
import type { JsonRecord } from "./types.ts";

const productsSchema = "products";

export async function restJson<T>(path: string, init: RequestInit): Promise<T> {
    const response = await rest(path, init);
    if (!response.ok) throw await restError(response);
    return await response.json() as T;
}

export async function rest(path: string, init: RequestInit): Promise<Response> {
    const key = serviceRoleKey();
    const base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("authorization", `Bearer ${key}`);
    headers.set("accept-profile", productsSchema);
    if (init.method && init.method !== "GET") headers.set("content-profile", productsSchema);

    return fetch(`${base}/rest/v1/${path}`, { ...init, headers });
}

export async function getOne(table: string, filters: JsonRecord, select = "*"): Promise<JsonRecord | null> {
    const params = new URLSearchParams();
    params.set("select", select);
    params.set("limit", "1");
    for (const [key, value] of Object.entries(filters)) {
        if (value === null) params.set(key, "is.null");
        else params.set(key, `eq.${String(value)}`);
    }
    const rows = await restJson<JsonRecord[]>(`${table}?${params.toString()}`, { method: "GET" });
    return rows[0] ?? null;
}

export async function rowByIdOrSlug(table: string, url: URL, select: string): Promise<JsonRecord | null> {
    const id = url.searchParams.get("id");
    const slug = url.searchParams.get("slug");
    if (!id && !slug) throw new HttpError(400, "id or slug is required");
    return id ? await getOne(table, { id }, select) : await getOne(table, { slug: slug! }, select);
}

export async function rowByFilters(
    table: string,
    select: string,
    filters: JsonRecord,
): Promise<JsonRecord | null> {
    if (!Object.keys(filters).length) throw new HttpError(400, "identifier is required");
    return await getOne(table, filters, select);
}

export async function restError(response: Response): Promise<HttpError> {
    const data = await response.json().catch(() => null);
    const message = isRecord(data) && typeof data.message === "string"
        ? data.message
        : `Supabase request failed (${response.status})`;
    return new HttpError(502, message);
}
