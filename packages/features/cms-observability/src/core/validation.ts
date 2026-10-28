import { LOG_LEVELS, type LogLevel } from "@bernouy/logging";
import type { LogEntry, LogGroup, LogQuery, NormalizedLogQuery } from "cms-observability/interfaces/Journal";

export class ObservabilityError extends Error {
    constructor(readonly code: "INVALID_INPUT" | "INVALID_CURSOR" | "ENTRY_CONFLICT" | "NOT_FOUND") {
        super(code);
        this.name = "ObservabilityError";
    }
}

export function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).some((key) => !keys.includes(key))
    ) {
        throw new ObservabilityError("INVALID_INPUT");
    }
    return value as Record<string, unknown>;
}

export function text(value: unknown, maximum = 128): string {
    if (
        typeof value !== "string" ||
        value.length < 1 ||
        value.length > maximum ||
        /[\u0000-\u001f\u007f]/u.test(value)
    ) {
        throw new ObservabilityError("INVALID_INPUT");
    }
    return value;
}

function timestamp(value: unknown): string {
    const result = text(value, 32);
    if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) {
        throw new ObservabilityError("INVALID_INPUT");
    }
    return result;
}

export function parseEntry(value: unknown): LogEntry {
    const entry = object(value, [
        "id",
        "time",
        "level",
        "event",
        "component",
        "requestId",
        "invocationId",
        "traceId",
        "parentInvocationId",
        "contractId",
        "capabilityId",
        "durationMs",
        "attributes",
        "error",
    ]);
    const id = text(entry.id, 36);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id)) {
        throw new ObservabilityError("INVALID_INPUT");
    }
    const event = text(entry.event);
    if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(event) || !LOG_LEVELS.includes(entry.level as LogLevel)) {
        throw new ObservabilityError("INVALID_INPUT");
    }
    const attributes = entry.attributes;
    if (
        !attributes ||
        typeof attributes !== "object" ||
        Array.isArray(attributes) ||
        Object.keys(attributes).length > 24
    ) {
        throw new ObservabilityError("INVALID_INPUT");
    }
    for (const [key, item] of Object.entries(attributes)) {
        text(key, 128);
        if (typeof item !== "string" || item.length > 1024) {
            throw new ObservabilityError("INVALID_INPUT");
        }
    }
    const optional: Record<string, string | number> = {};
    for (const key of [
        "component",
        "requestId",
        "invocationId",
        "traceId",
        "parentInvocationId",
        "contractId",
        "capabilityId",
    ] as const) {
        if (entry[key] !== undefined) {
            optional[key] = text(entry[key]);
        }
    }
    if (entry.durationMs !== undefined) {
        if (
            typeof entry.durationMs !== "number" ||
            !Number.isFinite(entry.durationMs) ||
            entry.durationMs < 0 ||
            entry.durationMs > 86_400_000
        ) {
            throw new ObservabilityError("INVALID_INPUT");
        }
        optional.durationMs = entry.durationMs;
    }
    if (entry.error !== undefined) {
        const error = object(entry.error, ["name", "message", "stack"]);
        for (const [key, item] of Object.entries(error)) {
            if (typeof item !== "string" || item.length > 2048 || !["name", "message", "stack"].includes(key)) {
                throw new ObservabilityError("INVALID_INPUT");
            }
        }
        if (typeof error.name !== "string" || typeof error.message !== "string") {
            throw new ObservabilityError("INVALID_INPUT");
        }
    }
    return { ...entry, ...optional, id, event, time: timestamp(entry.time) } as unknown as LogEntry;
}

const QUERY_KEYS = [
    "timeField",
    "from",
    "to",
    "levels",
    "minLevel",
    "service",
    "component",
    "event",
    "eventPrefix",
    "requestId",
    "invocationId",
    "traceId",
    "parentInvocationId",
    "contractId",
    "capabilityId",
    "limit",
    "cursor",
];
export function normalizeQuery(value: unknown, now: Date, bounds?: { from: string; to: string }): NormalizedLogQuery {
    const input = object(value, QUERY_KEYS) as LogQuery;
    const to = input.to === undefined || input.to === "" ? (bounds?.to ?? now.toISOString()) : timestamp(input.to);
    const from =
        input.from === undefined || input.from === ""
            ? (bounds?.from ?? new Date(Date.parse(to) - 86_400_000).toISOString())
            : timestamp(input.from);
    if (Date.parse(from) >= Date.parse(to) || Date.parse(to) - Date.parse(from) > 31 * 86_400_000) {
        throw new ObservabilityError("INVALID_INPUT");
    }
    const limit = input.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
        throw new ObservabilityError("INVALID_INPUT");
    }
    const filters: Record<string, unknown> = {};
    if (input.timeField !== undefined) {
        if (input.timeField !== "time" && input.timeField !== "receivedAt") {
            throw new ObservabilityError("INVALID_INPUT");
        }
        filters.timeField = input.timeField;
    }
    for (const key of QUERY_KEYS.filter(
        (key) => !["from", "to", "limit", "cursor", "levels", "minLevel", "timeField"].includes(key),
    )) {
        if ((input as Record<string, unknown>)[key] !== undefined && (input as Record<string, unknown>)[key] !== "") {
            filters[key] = text((input as Record<string, unknown>)[key]);
        }
    }
    if (input.levels !== undefined) {
        if (
            !Array.isArray(input.levels) ||
            input.levels.length < 1 ||
            input.levels.length > 6 ||
            input.levels.some((level) => !LOG_LEVELS.includes(level))
        ) {
            throw new ObservabilityError("INVALID_INPUT");
        }
        filters.levels = [...new Set(input.levels)].sort();
    }
    if (input.minLevel !== undefined && String(input.minLevel) !== "") {
        if (!LOG_LEVELS.includes(input.minLevel)) {
            throw new ObservabilityError("INVALID_INPUT");
        }
        const accepted = LOG_LEVELS.slice(LOG_LEVELS.indexOf(input.minLevel));
        filters.levels = (input.levels ?? accepted).filter((level) => accepted.includes(level)).sort();
    }
    return { from, to, limit, ...filters };
}

export function parseGroup(value: unknown): LogGroup {
    if (!["level", "service", "event", "component", "contractId", "capabilityId"].includes(String(value))) {
        throw new ObservabilityError("INVALID_INPUT");
    }
    return value as LogGroup;
}
