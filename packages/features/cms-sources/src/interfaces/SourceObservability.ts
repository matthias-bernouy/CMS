export const SOURCE_TIMING_STAGES = [
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
    "cms_image_upstream",
    "cms_image_read",
    "cms_image_decode",
    "cms_image_semaphore_wait",
    "cms_image_encode",
    "cms_image_store",
    "cms_projection",
    "cms_identity_binding",
    "cms_total",
] as const;

export type SourceTimingStage = (typeof SOURCE_TIMING_STAGES)[number];
export type SourceRequestOutcome = "success" | "client_error" | "server_error" | "timeout";
export type SourceDiagnosticCohort = "uniform" | "forced";

export const UNRESOLVED_SOURCE_ENDPOINT = "__unresolved__";

export type SourceRequestObservation = {
    observedAt: Date;
    correlationId: string;
    endpointUrn: string;
    method: string;
    status: number;
    outcome: SourceRequestOutcome;
    stagesMs: Readonly<Partial<Record<SourceTimingStage, number>>>;
};

export type SourceRequestDiagnostic = SourceRequestObservation & {
    cohorts: readonly SourceDiagnosticCohort[];
};

export type SourceRequestObserver = (observation: SourceRequestObservation) => void | Promise<void>;
export type SourceDiagnosticReporter = (diagnostic: SourceRequestDiagnostic) => void | Promise<void>;

export type SourceRequestTelemetryOptions = {
    observe?: SourceRequestObserver;
    reportDiagnostic?: SourceDiagnosticReporter;
    uniformSampleRate?: number;
    slowRequestThresholdMs?: number;
    exposeServerTiming?: (request: Request) => boolean;
    random?: () => number;
    clock?: () => number;
    now?: () => Date;
};

export type SourceExecutionObservability = {
    readonly correlationId: string;
    measure<T>(stage: SourceTimingStage, operation: () => T | Promise<T>): Promise<T>;
    record(stage: SourceTimingStage, durationMs: number): boolean;
};
