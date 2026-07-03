import { isRecord, snakeCase, stripUndefined } from "../core/records.ts";
import type { JsonRecord } from "../core/types.ts";

export function writePayload(body: JsonRecord): JsonRecord {
    return isRecord(body.data) ? body.data : body;
}

export function withQueryId(body: JsonRecord, id: string | null): JsonRecord {
    if (!id) return body;
    const payload = writePayload(body);
    if (payload.id !== undefined && payload.id !== null && payload.id !== "") return body;
    if (isRecord(body.data)) return { ...body, data: { ...body.data, id } };
    return { ...body, id };
}

export function withQueryDefaults(body: JsonRecord, params: URLSearchParams, names: string[]): JsonRecord {
    let next = body;
    for (const name of names) {
        const value = params.get(name);
        if (!value) continue;
        const payload = writePayload(next);
        if (payload[name] !== undefined && payload[name] !== null && payload[name] !== "") continue;
        next = isRecord(next.data) ? { ...next, data: { ...next.data, [name]: value } } : { ...next, [name]: value };
    }
    return next;
}

export function toDbRow(input: JsonRecord): JsonRecord {
    const row: JsonRecord = {};
    for (const [key, value] of Object.entries(input)) {
        if (key === "externalReference" || key === "external_reference" || key === "data") continue;
        row[snakeCase(key)] = value;
    }
    return stripUndefined(row);
}
