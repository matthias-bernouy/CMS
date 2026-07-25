import { HttpError } from "./errors.ts";
import { camelize, isRecord } from "./records.ts";
import type { JsonRecord } from "./types.ts";

export function rpcRecord(value: unknown, resource = "resource"): JsonRecord {
    const payload = camelize(value);
    if (!isRecord(payload)) {
        throw new HttpError(502, `invalid ${resource} response`);
    }
    const code = typeof payload.code === "string" ? payload.code : undefined;
    if (payload.state === "not_found") {
        throw new HttpError(404, `${resource} not found`);
    }
    if (payload.state === "conflict") {
        throw new HttpError(409, code ?? `${resource} conflict`);
    }
    if (payload.state === "invalid") {
        throw new HttpError(422, code ?? `invalid ${resource}`);
    }
    if (typeof payload.state === "string" && payload.state !== "ok") {
        throw new HttpError(502, `invalid ${resource} state`);
    }
    return payload;
}

export function rpcEntity(value: unknown, key: string, resource = key): JsonRecord {
    const payload = rpcRecord(value, resource);
    const entity = payload[key];
    if (!isRecord(entity)) {
        throw new HttpError(502, `invalid ${resource} response`);
    }
    return entity;
}
