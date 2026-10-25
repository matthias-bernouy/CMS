import type {
    RequestTimingClock,
    RequestTimingCounts,
    RequestTimingSnapshot,
} from "http-runner/interfaces/RequestObservability";
import { currentTimingRequest } from "http-runner/core/request/context";

export const SERVER_TIMING_HEADER = "server-timing";
export const MAX_REQUEST_TIMING_ENTRIES = 32;

const TIMING_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const timings = new WeakMap<Request, Map<string, number>>();
const timingCounts = new WeakMap<Request, Map<string, number>>();
const finishedTimings = new WeakMap<Request, RequestTimingSnapshot>();
const finishedTimingCounts = new WeakMap<Request, RequestTimingCounts>();

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
    let counts = timingCounts.get(request);
    if (!counts) {
        counts = new Map();
        timingCounts.set(request, counts);
    }
    counts.set(name, (counts.get(name) ?? 0) + 1);
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

/** Records a nested stage against the active inbound request, if one exists. */
export function recordCurrentRequestTiming(name: string, durationMs: number): boolean {
    const request = currentTimingRequest();
    return request ? recordRequestTiming(request, name, durationMs) : false;
}

/** Measures a nested stage without threading the inbound Request through application services. */
export async function measureCurrentRequestTiming<T>(
    name: string,
    operation: () => T | Promise<T>,
    clock: RequestTimingClock = performance.now.bind(performance),
): Promise<T> {
    const startedAt = clock();
    try {
        return await operation();
    } finally {
        recordCurrentRequestTiming(name, Math.max(0, clock() - startedAt));
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
    const counts = requestTimingCountSnapshot(request);
    finishedTimings.set(request, snapshot);
    finishedTimingCounts.set(request, counts);
    timings.delete(request);
    timingCounts.delete(request);
    return snapshot;
}

export function requestTimingCountSnapshot(request: Request): RequestTimingCounts {
    const finished = finishedTimingCounts.get(request);
    if (finished) {
        return finished;
    }
    const entries = timingCounts.get(request);
    return Object.freeze(entries ? Object.fromEntries(entries) : {});
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
