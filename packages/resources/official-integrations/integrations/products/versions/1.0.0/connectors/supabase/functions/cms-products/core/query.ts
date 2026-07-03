import { HttpError } from "./errors.ts";
import { camelizeRecord } from "./records.ts";
import type { JsonRecord } from "./types.ts";

export function listQuery(select: string, url: URL, order: string): URLSearchParams {
    const query = new URLSearchParams();
    query.set("select", select);
    query.set("order", order);
    query.set("limit", String(limitParam(url, 50)));
    query.set("offset", String(offsetParam(url)));
    return query;
}

export function appendEqualQuery(query: URLSearchParams, column: string, value: string | null | undefined): void {
    if (value === undefined || value === null || value === "") return;
    query.set(column, `eq.${value}`);
}

export function appendNullableQuery(query: URLSearchParams, column: string, value: string | null | undefined): void {
    if (value === undefined || value === null || value === "") return;
    if (value === "null") query.set(column, "is.null");
    else appendEqualQuery(query, column, value);
}

export function appendTextSearch(query: URLSearchParams, url: URL, columns: string[]): void {
    const value = queryText(url, "q")?.replace(/[,*()]/g, " ").trim();
    if (!value) return;
    query.set("or", columns.map(column => `${column}.ilike.*${value}*`).join(","));
}

export function listResponse(rows: JsonRecord[], url: URL): JsonRecord {
    return {
        items: rows.map(camelizeRecord),
        limit: limitParam(url, 50),
        offset: offsetParam(url),
    };
}

export function queryText(url: URL, name: string): string | undefined {
    const value = url.searchParams.get(name);
    return value && value.trim() ? value.trim() : undefined;
}

export function limitParam(url: URL, fallback: number): number {
    const value = numberOrNull(url.searchParams.get("limit"));
    return Math.min(Math.max(value ?? fallback, 1), 100);
}

export function offsetParam(url: URL): number {
    return Math.max(numberOrNull(url.searchParams.get("offset")) ?? 0, 0);
}

export function requiredPositiveInteger(value: string | null, name: string): number {
    const number = numberOrNull(value);
    if (!Number.isInteger(number) || number < 1) throw new HttpError(400, `${name} must be a positive integer`);
    return number;
}

function numberOrNull(value: string | null): number | null {
    if (value === null || value === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new HttpError(400, `${value} is not a number`);
    return parsed;
}
