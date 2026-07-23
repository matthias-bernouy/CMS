import {
    measureRequestTiming,
    recordRequestTiming,
    requestCorrelationId,
    type Middleware,
} from "@bernouy/http-runner/observability";
import {
    UNRESOLVED_SOURCE_ENDPOINT,
    type SourceExecutionObservability,
    type SourceRequestTelemetryOptions,
    type SourceTimingStage,
} from "cms-sources/interfaces/SourceObservability";
import {
    completeSourceObservation,
    isUniformSourceSample,
} from "cms-sources/core/execution/sourceObservationReporting";

type SourceRequestContext = {
    observability: SourceExecutionObservability;
    options: SourceRequestTelemetryOptions;
    endpointUrn: string;
    startedAt: number;
    uniformSampled: boolean;
};

const contexts = new WeakMap<Request, SourceRequestContext>();

export function createSourceRequestTelemetryMiddleware(options: SourceRequestTelemetryOptions = {}): Middleware {
    return (request, next) => runObservedSourceRequest(request, options, () => next());
}

export async function runObservedSourceRequest(
    request: Request,
    options: SourceRequestTelemetryOptions,
    operation: () => Promise<Response>,
): Promise<Response> {
    if (contexts.has(request)) {
        return operation();
    }
    const context = createContext(request, options);
    contexts.set(request, context);
    try {
        const response = await operation();
        return safelyComplete(request, context, response) ?? response;
    } catch (error) {
        safelyComplete(request, context);
        throw error;
    } finally {
        contexts.delete(request);
    }
}

export function activeSourceObservability(request: Request): SourceExecutionObservability | undefined {
    return contexts.get(request)?.observability;
}

export function setObservedSourceEndpoint(request: Request, endpointUrn: string): void {
    const context = contexts.get(request);
    if (context) {
        context.endpointUrn = endpointUrn;
    }
}

export function measureActiveSourceTiming<T>(
    request: Request,
    stage: SourceTimingStage,
    operation: () => T | Promise<T>,
): Promise<T> {
    const observability = activeSourceObservability(request);
    return observability ? observability.measure(stage, operation) : Promise.resolve(operation());
}

function createContext(request: Request, options: SourceRequestTelemetryOptions): SourceRequestContext {
    const clock = safeClock(options.clock);
    const safeOptions = { ...options, clock };
    const observability: SourceExecutionObservability = {
        correlationId: requestCorrelationId(request),
        measure: (stage, operation) => measureRequestTiming(request, stage, operation, clock),
        record: (stage, durationMs) => recordRequestTiming(request, stage, durationMs),
    };
    return {
        observability,
        options: safeOptions,
        endpointUrn: UNRESOLVED_SOURCE_ENDPOINT,
        startedAt: clock(),
        uniformSampled: isUniformSourceSample(safeOptions),
    };
}

function safelyComplete(request: Request, context: SourceRequestContext, response?: Response): Response | undefined {
    try {
        return completeSourceObservation({
            request,
            response,
            observedAt: observationDate(context.options),
            ...context,
        });
    } catch {
        return response;
    }
}

function observationDate(options: SourceRequestTelemetryOptions): Date {
    try {
        const value = options.now?.() ?? new Date();
        return Number.isFinite(value.getTime()) ? value : new Date();
    } catch {
        return new Date();
    }
}

function safeClock(configured: (() => number) | undefined): () => number {
    const clock = configured ?? performance.now.bind(performance);
    return () => {
        try {
            const value = clock();
            return Number.isFinite(value) ? value : performance.now();
        } catch {
            return performance.now();
        }
    };
}
