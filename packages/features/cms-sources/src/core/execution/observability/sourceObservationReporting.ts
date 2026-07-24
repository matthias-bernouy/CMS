import {
    finishRequestTiming,
    serverTimingHeader,
    withRequestCorrelationHeader,
    type RequestTimingSnapshot,
} from "@bernouy/http-runner/observability";
import {
    SOURCE_TIMING_STAGES,
    type SourceExecutionObservability,
    type SourceRequestDiagnostic,
    type SourceRequestObservation,
    type SourceRequestOutcome,
    type SourceRequestTelemetryOptions,
} from "cms-sources/interfaces/SourceObservability";
import { enqueueSourceDiagnostic } from "cms-sources/core/execution/observability/sourceDiagnosticDispatch";

const DEFAULT_SAMPLE_RATE = 0.01;
const DEFAULT_SLOW_REQUEST_MS = 1_000;
const sourceStageNames = new Set<string>(SOURCE_TIMING_STAGES);

export type SourceObservationCompletion = {
    request: Request;
    response?: Response;
    observedAt: Date;
    endpointUrn: string;
    startedAt: number;
    uniformSampled: boolean;
    observability: SourceExecutionObservability;
    options: SourceRequestTelemetryOptions;
};

export function completeSourceObservation(completion: SourceObservationCompletion): Response | undefined {
    const { request, response, observability, options } = completion;
    const clock = options.clock ?? performance.now.bind(performance);
    observability.record("cms_upstream", 0);
    observability.record("cms_total", Math.max(0, clock() - completion.startedAt));
    const stagesMs = sourceStages(finishRequestTiming(request));
    const status = response?.status ?? 500;
    const observation: SourceRequestObservation = Object.freeze({
        observedAt: completion.observedAt,
        correlationId: observability.correlationId,
        endpointUrn: completion.endpointUrn,
        method: normalizedMethod(request.method),
        status,
        outcome: requestOutcome(status),
        stagesMs,
    });
    reportObservation(options, observation, completion.uniformSampled);
    if (!response) {
        return;
    }
    const withTiming = shouldExposeServerTiming(options, request) ? attachServerTiming(response, stagesMs) : response;
    return withRequestCorrelationHeader(request, withTiming);
}

export function isUniformSourceSample(options: SourceRequestTelemetryOptions): boolean {
    if (!options.reportDiagnostic) {
        return false;
    }
    const rate = validSampleRate(options.uniformSampleRate);
    try {
        return (options.random?.() ?? Math.random()) < rate;
    } catch {
        return false;
    }
}

function sourceStages(snapshot: RequestTimingSnapshot): SourceRequestObservation["stagesMs"] {
    return Object.freeze(Object.fromEntries(Object.entries(snapshot).filter(([name]) => sourceStageNames.has(name))));
}

function reportObservation(
    options: SourceRequestTelemetryOptions,
    observation: SourceRequestObservation,
    uniformSampled: boolean,
): void {
    safelyReport(options.observe, observation);
    if (!options.reportDiagnostic) {
        return;
    }
    const forced = observation.status >= 400 || (observation.stagesMs.cms_total ?? 0) >= slowThreshold(options);
    const cohorts = [...(uniformSampled ? (["uniform"] as const) : []), ...(forced ? (["forced"] as const) : [])];
    if (cohorts.length) {
        const diagnostic: SourceRequestDiagnostic = Object.freeze({
            ...observation,
            cohorts: Object.freeze(cohorts),
        });
        enqueueSourceDiagnostic(options.reportDiagnostic, diagnostic);
    }
}

function safelyReport<T>(reporter: ((value: T) => void | Promise<void>) | undefined, value: T): void {
    if (!reporter) {
        return;
    }
    try {
        void Promise.resolve(reporter(value)).catch(() => undefined);
    } catch {
        // Telemetry must never affect a source response.
    }
}

function validSampleRate(value: number | undefined): number {
    return value !== undefined && Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_SAMPLE_RATE;
}

function slowThreshold(options: SourceRequestTelemetryOptions): number {
    const value = options.slowRequestThresholdMs;
    return value !== undefined && Number.isFinite(value) && value >= 0 ? value : DEFAULT_SLOW_REQUEST_MS;
}

function normalizedMethod(method: string): string {
    const normalized = method.toUpperCase();
    return /^[A-Z]{1,16}$/.test(normalized) ? normalized : "OTHER";
}

function requestOutcome(status: number): SourceRequestOutcome {
    if (status === 504) {
        return "timeout";
    }
    if (status >= 500) {
        return "server_error";
    }
    return status >= 400 ? "client_error" : "success";
}

function shouldExposeServerTiming(options: SourceRequestTelemetryOptions, request: Request): boolean {
    try {
        return options.exposeServerTiming?.(request) === true;
    } catch {
        return false;
    }
}

function attachServerTiming(response: Response, stages: SourceRequestObservation["stagesMs"]): Response {
    const value = serverTimingHeader(stages, sourceStageNames);
    if (!value) {
        return response;
    }
    try {
        const headers = new Headers(response.headers);
        headers.set("server-timing", value);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    } catch {
        return response;
    }
}
