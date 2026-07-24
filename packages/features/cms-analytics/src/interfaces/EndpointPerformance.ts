import type { EndpointPerformanceDashboard } from "./EndpointPerformanceDashboard";

export const ENDPOINT_PERFORMANCE_UNRESOLVED = "__unresolved__" as const;

export const ENDPOINT_PERFORMANCE_SURFACES = ["control", "delivery"] as const;
export type EndpointPerformanceSurface = (typeof ENDPOINT_PERFORMANCE_SURFACES)[number];

export const ENDPOINT_PERFORMANCE_METHODS = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
    "OTHER",
] as const;
export type EndpointPerformanceMethod = (typeof ENDPOINT_PERFORMANCE_METHODS)[number];

export const ENDPOINT_PERFORMANCE_STATUS_CLASSES = ["1xx", "2xx", "3xx", "4xx", "5xx"] as const;
export type EndpointPerformanceStatusClass = (typeof ENDPOINT_PERFORMANCE_STATUS_CLASSES)[number];
export type EndpointPerformanceOutcome = "informational" | "success" | "redirect" | "client_error" | "server_error";

export const ENDPOINT_TIMING_STAGES = [
    "cms_auth",
    "cms_endpoint_auth_lookup",
    "cms_authorize",
    "cms_roles",
    "cms_endpoint_resolve",
    "cms_source",
    "cms_overlays",
    "cms_context",
    "cms_secret",
    "cms_headers",
    "cms_body",
    "cms_upstream",
    "cms_projection",
    "cms_identity_binding",
    "cms_total",
    "edge_route",
    "edge_db_wall",
    "edge_db_sum",
    "edge_provider",
    "edge_projection",
    "edge_total",
] as const;
export type EndpointTimingStage = (typeof ENDPOINT_TIMING_STAGES)[number];

export const ENDPOINT_COUNTER_STAGES = ["edge_db_calls"] as const;
export type EndpointCounterStage = (typeof ENDPOINT_COUNTER_STAGES)[number];

export type EndpointPerformanceObservation = {
    ts: Date;
    surface: EndpointPerformanceSurface;
    endpointUrn: string | typeof ENDPOINT_PERFORMANCE_UNRESOLVED;
    method: string;
    status: number;
    /** Elapsed durations only. Non-duration measurements belong in `counters`. */
    stagesMs: Readonly<Partial<Record<EndpointTimingStage, number>>>;
    /** Bounded per-request counts; currently limited to Edge database calls. */
    counters?: Readonly<Partial<Record<EndpointCounterStage, number>>>;
};

export interface EndpointPerformanceRecorder {
    /** Synchronously updates bounded memory only; callers never await persistence. */
    observe(observation: EndpointPerformanceObservation): void;
}

export const ENDPOINT_PERFORMANCE_RANGES = ["1h", "24h", "7d"] as const;
export type EndpointPerformanceRange = (typeof ENDPOINT_PERFORMANCE_RANGES)[number];
export const ENDPOINT_PERFORMANCE_SORTS = ["requests", "errorRate", "p50", "p95", "p99", "max"] as const;
export type EndpointPerformanceSort = (typeof ENDPOINT_PERFORMANCE_SORTS)[number];

export type EndpointPerformanceQuery = {
    range: EndpointPerformanceRange;
    surface?: EndpointPerformanceSurface;
    endpointUrn?: string;
    method?: EndpointPerformanceMethod;
    statusClass?: EndpointPerformanceStatusClass;
    sort: EndpointPerformanceSort;
    order: "asc" | "desc";
    limit: number;
};

export interface EndpointPerformanceReports {
    dashboard(query: EndpointPerformanceQuery, now?: Date): Promise<EndpointPerformanceDashboard>;
}
