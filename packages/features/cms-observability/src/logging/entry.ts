import type { LogRecord } from "@bernouy/logging";
import type { LogEntry } from "cms-observability/interfaces/Journal";

export function entryFromRecord(record: LogRecord): LogEntry {
    const values = record.attributes ?? {};
    const fields: Record<string, string | number> = {};
    for (const field of [
        "component",
        "requestId",
        "invocationId",
        "traceId",
        "parentInvocationId",
        "contractId",
        "capabilityId",
    ] as const) {
        const value = values[field];
        if (
            typeof value === "string" &&
            value.length > 0 &&
            value.length <= 128 &&
            !/[\u0000-\u001f\u007f]/u.test(value)
        ) {
            fields[field] = value;
        }
    }
    if (
        typeof values.durationMs === "number" &&
        Number.isFinite(values.durationMs) &&
        values.durationMs >= 0 &&
        values.durationMs <= 86_400_000
    ) {
        fields.durationMs = values.durationMs;
    }
    const attributes = Object.fromEntries(
        Object.entries(values)
            .slice(0, 24)
            .map(([key, value]) => [
                key,
                (typeof value === "string" ? value : (JSON.stringify(value) ?? String(value))).slice(0, 1024),
            ]),
    );
    return {
        id: crypto.randomUUID(),
        time: record.time,
        level: record.level,
        event: record.event,
        ...fields,
        attributes,
        ...(record.error ? { error: record.error } : {}),
    };
}
