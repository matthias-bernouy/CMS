import type { EndpointPerformanceRecorder, EndpointPerformanceSurface } from "@bernouy/cms-analytics";
import type { SourceRequestDiagnostic, SourceRequestTelemetryOptions } from "@bernouy/cms-sources";

type SourceTelemetryConfig = {
    uniformSampleRate: number;
    slowRequestThresholdMs: number;
    reportDiagnostic: (message: string) => void;
};

export function createSourceTelemetryOptions(
    surface: EndpointPerformanceSurface,
    recorder: EndpointPerformanceRecorder,
    config: SourceTelemetryConfig,
): SourceRequestTelemetryOptions {
    return {
        uniformSampleRate: config.uniformSampleRate,
        slowRequestThresholdMs: config.slowRequestThresholdMs,
        observe(observation) {
            recorder.observe({
                ts: observation.observedAt,
                surface,
                endpointUrn: observation.endpointUrn,
                method: observation.method,
                status: observation.status,
                stagesMs: observation.stagesMs,
            });
        },
        reportDiagnostic(diagnostic) {
            config.reportDiagnostic(sourceDiagnosticLog(surface, diagnostic));
        },
    };
}

export function createSurfaceSourceTelemetry(
    recorder: EndpointPerformanceRecorder,
    config: SourceTelemetryConfig,
): Record<EndpointPerformanceSurface, SourceRequestTelemetryOptions> {
    return {
        control: createSourceTelemetryOptions("control", recorder, config),
        delivery: createSourceTelemetryOptions("delivery", recorder, config),
    };
}

function sourceDiagnosticLog(surface: EndpointPerformanceSurface, diagnostic: SourceRequestDiagnostic): string {
    return JSON.stringify({
        event: "cms_source_request",
        surface,
        cohorts: diagnostic.cohorts,
        correlationId: diagnostic.correlationId,
        endpointUrn: diagnostic.endpointUrn,
        method: diagnostic.method,
        status: diagnostic.status,
        outcome: diagnostic.outcome,
        stagesMs: diagnostic.stagesMs,
    });
}
