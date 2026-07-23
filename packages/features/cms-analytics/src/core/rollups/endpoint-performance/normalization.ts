import {
    ENDPOINT_PERFORMANCE_METHODS,
    ENDPOINT_PERFORMANCE_SURFACES,
    ENDPOINT_PERFORMANCE_UNRESOLVED,
    ENDPOINT_TIMING_STAGES,
    type EndpointPerformanceMethod,
    type EndpointPerformanceObservation,
    type EndpointPerformanceOutcome,
    type EndpointPerformanceStatusClass,
    type EndpointTimingStage,
} from "../../../interfaces/EndpointPerformance";

export const ENDPOINT_PERFORMANCE_BUCKET_MS = 300_000;
export const ENDPOINT_PERFORMANCE_RETENTION_DAYS = 14;
export const MAX_ENDPOINT_PERFORMANCE_DURATION_MS = 300_000;

const SAFE_ENDPOINT_URN = /^urn:[A-Za-z0-9][A-Za-z0-9_-]{0,63}:[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MAX_OBSERVATION_CLOCK_SKEW_MS = ENDPOINT_PERFORMANCE_BUCKET_MS;
const METHODS = new Set<string>(ENDPOINT_PERFORMANCE_METHODS);
const SURFACES = new Set<string>(ENDPOINT_PERFORMANCE_SURFACES);

export type NormalizedEndpointPerformanceObservation = {
    ts: Date;
    surface: EndpointPerformanceObservation["surface"];
    endpointUrn: string;
    method: EndpointPerformanceMethod;
    statusClass: EndpointPerformanceStatusClass;
    outcome: EndpointPerformanceOutcome;
    stagesMs: Partial<Record<EndpointTimingStage, number>>;
};

export function normalizeEndpointPerformanceObservation(
    observation: EndpointPerformanceObservation,
    now: Date,
): NormalizedEndpointPerformanceObservation | null {
    if (
        !(observation.ts instanceof Date) ||
        !Number.isFinite(observation.ts.getTime()) ||
        Math.abs(observation.ts.getTime() - now.getTime()) > MAX_OBSERVATION_CLOCK_SKEW_MS ||
        !SURFACES.has(observation.surface) ||
        !Number.isInteger(observation.status) ||
        observation.status < 100 ||
        observation.status > 599
    ) {
        return null;
    }
    const stagesMs: Partial<Record<EndpointTimingStage, number>> = {};
    for (const stage of ENDPOINT_TIMING_STAGES) {
        const duration = observation.stagesMs?.[stage];
        if (isValidDuration(duration)) {
            stagesMs[stage] = duration;
        }
    }
    if (stagesMs.cms_total === undefined) {
        return null;
    }
    const statusClass = `${Math.floor(observation.status / 100)}xx` as EndpointPerformanceStatusClass;
    return {
        ts: new Date(observation.ts),
        surface: observation.surface,
        endpointUrn: normalizeEndpointUrn(observation.endpointUrn),
        method: normalizeMethod(observation.method),
        statusClass,
        outcome: outcomeOf(statusClass),
        stagesMs,
    };
}

export function isSafeEndpointPerformanceUrn(value: string): boolean {
    return value === ENDPOINT_PERFORMANCE_UNRESOLVED || (value.length <= 256 && SAFE_ENDPOINT_URN.test(value));
}

export function truncateEndpointPerformanceBucket(value: Date): Date {
    return new Date(Math.floor(value.getTime() / ENDPOINT_PERFORMANCE_BUCKET_MS) * ENDPOINT_PERFORMANCE_BUCKET_MS);
}

function normalizeEndpointUrn(value: string): string {
    return isSafeEndpointPerformanceUrn(value) ? value : ENDPOINT_PERFORMANCE_UNRESOLVED;
}

function normalizeMethod(value: string): EndpointPerformanceMethod {
    const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
    return METHODS.has(normalized) ? (normalized as EndpointPerformanceMethod) : "OTHER";
}

function isValidDuration(value: number | undefined): value is number {
    return value !== undefined && Number.isFinite(value) && value >= 0 && value <= MAX_ENDPOINT_PERFORMANCE_DURATION_MS;
}

function outcomeOf(statusClass: EndpointPerformanceStatusClass): EndpointPerformanceOutcome {
    return (
        {
            "1xx": "informational",
            "2xx": "success",
            "3xx": "redirect",
            "4xx": "client_error",
            "5xx": "server_error",
        } as const
    )[statusClass];
}
