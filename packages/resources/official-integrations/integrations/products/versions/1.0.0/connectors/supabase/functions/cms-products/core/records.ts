import { HttpError } from "./errors.ts";
import type { JsonRecord } from "./types.ts";

export function stringValue(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function keyFrom(row: JsonRecord, keys: string[]): JsonRecord | null {
    const key: JsonRecord = {};
    for (const name of keys) {
        if (row[name] === undefined || row[name] === null || row[name] === "") return null;
        key[name] = row[name];
    }
    return key;
}

export function camelizeValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(camelizeValue);
    if (!isRecord(value)) return value;
    return camelizeRecord(value);
}

export function camelizeRecord(value: JsonRecord): JsonRecord {
    const result: JsonRecord = {};
    for (const [key, entry] of Object.entries(value)) {
        result[camelCase(key)] = camelizeValue(entry);
    }
    return result;
}

export function snakeCase(value: string): string {
    return value.replace(/[A-Z]/g, match => `_${match.toLowerCase()}`);
}

export function stripUndefined(value: JsonRecord): JsonRecord {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export function firstRow(value: unknown): JsonRecord {
    if (!Array.isArray(value) || !isRecord(value[0])) {
        throw new HttpError(502, "Supabase returned no rows");
    }
    return value[0];
}

export async function readJsonObject(request: Request): Promise<JsonRecord> {
    let value: unknown;
    try {
        value = await request.json();
    } catch {
        throw new HttpError(400, "invalid JSON body");
    }
    if (!isRecord(value)) throw new HttpError(400, "body must be an object");
    return value;
}

export function isRecord(value: unknown): value is JsonRecord {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function camelCase(value: string): string {
    return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
