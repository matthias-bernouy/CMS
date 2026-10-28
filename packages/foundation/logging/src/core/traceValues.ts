export interface TraceContext {
    readonly traceId: string;
    readonly spanId: string;
    readonly parentSpanId?: string;
}
const ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
export function isTraceContext(value: unknown): value is TraceContext {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return (
        Object.keys(record).every((key) => ["traceId", "spanId", "parentSpanId"].includes(key)) &&
        [record.traceId, record.spanId].every((part) => typeof part === "string" && ID.test(part)) &&
        (record.parentSpanId === undefined || (typeof record.parentSpanId === "string" && ID.test(record.parentSpanId)))
    );
}

export const TRACE_CONTEXT_HEADER = "x-ulvia-trace";
export function readTraceContext(value: string | null): TraceContext | undefined {
    if (!value || value.length > 256) {
        return undefined;
    }
    try {
        const parsed: unknown = JSON.parse(value);
        return isTraceContext(parsed) ? { ...parsed } : undefined;
    } catch {
        return undefined;
    }
}
