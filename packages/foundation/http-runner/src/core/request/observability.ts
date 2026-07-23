import type { Middleware } from "http-runner/interfaces/Runner";
import type { RequestTimingClock, RequestTimingSnapshot } from "http-runner/interfaces/RequestObservability";

export const CMS_CORRELATION_HEADER = "x-cms-correlation-id";
export const SERVER_TIMING_HEADER = "server-timing";
export const MAX_REQUEST_TIMING_ENTRIES = 32;

const TIMING_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const correlations = new WeakMap<Request, string>();
const timings = new WeakMap<Request, Map<string, number>>();
const finishedTimings = new WeakMap<Request, RequestTimingSnapshot>();

export function isValidCorrelationId(value: string): boolean {
    return UUID_V4.test(value);
}

export function requestCorrelationId(request: Request): string {
    const existing = correlations.get(request);
    if (existing) {
        return existing;
    }
    const inbound = request.headers.get(CMS_CORRELATION_HEADER);
    const correlationId = inbound && isValidCorrelationId(inbound) ? inbound : crypto.randomUUID();
    correlations.set(request, correlationId);
    return correlationId;
}

export function existingRequestCorrelationId(request: Request): string | undefined {
    return correlations.get(request);
}

export function createRequestCorrelationMiddleware(): Middleware {
    return async (request, next) => {
        requestCorrelationId(request);
        return withRequestCorrelationHeader(request, await next());
    };
}

export function withRequestCorrelationHeader(request: Request, response: Response): Response {
    const correlationId = existingRequestCorrelationId(request);
    if (!correlationId || response.headers.get(CMS_CORRELATION_HEADER) === correlationId) {
        return response;
    }
    try {
        const headers = new Headers(response.headers);
        headers.set(CMS_CORRELATION_HEADER, correlationId);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    } catch {
        return response;
    }
}

export function recordRequestTiming(request: Request, name: string, durationMs: number): boolean {
    if (finishedTimings.has(request) || !TIMING_NAME.test(name) || !Number.isFinite(durationMs) || durationMs < 0) {
        return false;
    }
    let entries = timings.get(request);
    if (!entries) {
        entries = new Map();
        timings.set(request, entries);
    }
    if (!entries.has(name) && entries.size >= MAX_REQUEST_TIMING_ENTRIES) {
        return false;
    }
    entries.set(name, (entries.get(name) ?? 0) + durationMs);
    return true;
}

export async function measureRequestTiming<T>(
    request: Request,
    name: string,
    operation: () => T | Promise<T>,
    clock: RequestTimingClock = performance.now.bind(performance),
): Promise<T> {
    const startedAt = clock();
    try {
        return await operation();
    } finally {
        recordRequestTiming(request, name, Math.max(0, clock() - startedAt));
    }
}

export function requestTimingSnapshot(request: Request): RequestTimingSnapshot {
    const finished = finishedTimings.get(request);
    if (finished) {
        return finished;
    }
    const entries = timings.get(request);
    return Object.freeze(entries ? Object.fromEntries(entries) : {});
}

export function finishRequestTiming(request: Request): RequestTimingSnapshot {
    const snapshot = requestTimingSnapshot(request);
    finishedTimings.set(request, snapshot);
    timings.delete(request);
    return snapshot;
}

export function serverTimingHeader(snapshot: RequestTimingSnapshot, allowedNames: ReadonlySet<string>): string {
    return Object.entries(snapshot)
        .filter(
            ([name, duration]) =>
                allowedNames.has(name) && TIMING_NAME.test(name) && Number.isFinite(duration) && duration >= 0,
        )
        .slice(0, MAX_REQUEST_TIMING_ENTRIES)
        .map(([name, duration]) => `${name};dur=${roundedDuration(duration)}`)
        .join(", ");
}

function roundedDuration(durationMs: number): string {
    return (Math.round(durationMs * 10) / 10).toFixed(1);
}
