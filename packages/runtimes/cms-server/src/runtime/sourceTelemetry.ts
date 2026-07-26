import type { EndpointPerformanceRecorder, EndpointPerformanceSurface } from "@bernouy/cms-analytics";
import type { IntegrationPackageCacheEvent } from "@bernouy/cms-integration-packages/fs";
import type { IntegrationConnectorDeployer } from "@bernouy/cms-integrations";
import type { ExecutorDeps, SourceRequestDiagnostic, SourceRequestTelemetryOptions } from "@bernouy/cms-sources";

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

export function createIntegrationPackageCacheObserver(
    reportDiagnostic: (message: string) => void = (message) => console.info(message),
): (event: IntegrationPackageCacheEvent) => void {
    return (event) => {
        reportDiagnostic(
            JSON.stringify({
                event: "cms_integration_package_cache",
                outcome: event.type,
                digest: event.digest,
                ...(event.kind ? { kind: event.kind } : {}),
                ...(event.version ? { version: event.version } : {}),
                ...(event.bytes !== undefined ? { bytes: event.bytes } : {}),
                durationMs: event.durationMs,
            }),
        );
    };
}

export async function createTrustedConnectorTargetMatcher(
    deployers: readonly IntegrationConnectorDeployer[],
): Promise<NonNullable<ExecutorDeps["isTrustedConnectorTarget"]>> {
    const bases = (
        await Promise.all(
            deployers.map(async (deployer) => {
                try {
                    const output = await deployer.previewOutputs?.();
                    return trustedBase(output?.functionsBaseUrl);
                } catch {
                    return null;
                }
            }),
        )
    ).filter((base): base is URL => base !== null);
    return (_endpoint, target) => bases.some((base) => containsTarget(base, target));
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

function trustedBase(value: string | undefined): URL | null {
    try {
        const url = value ? new URL(value) : null;
        if (
            !url ||
            (url.protocol !== "https:" && url.protocol !== "http:") ||
            url.username ||
            url.password ||
            url.search ||
            url.hash
        ) {
            return null;
        }
        url.pathname = url.pathname.replace(/\/+$/, "") || "/";
        return url;
    } catch {
        return null;
    }
}

function containsTarget(base: URL, target: URL): boolean {
    if (base.origin !== target.origin || target.username || target.password) {
        return false;
    }
    const basePath = base.pathname === "/" ? "" : base.pathname;
    return target.pathname === basePath || target.pathname.startsWith(`${basePath}/`);
}
