import type { EndpointPerformanceRecorder, EndpointPerformanceSurface } from "@bernouy/cms-analytics";
import type { IntegrationConnectorDeployer } from "@bernouy/cms-integrations";
import type { ExecutorDeps, SourceRequestDiagnostic, SourceRequestTelemetryOptions } from "@bernouy/cms-sources";

export function createLocalSourceTelemetry(
    surface: EndpointPerformanceSurface,
    recorder: EndpointPerformanceRecorder,
    uniformSampleRate: number,
): SourceRequestTelemetryOptions {
    return {
        uniformSampleRate,
        slowRequestThresholdMs: 1_000,
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
            console.log(sourceDiagnosticLog(surface, diagnostic));
        },
    };
}

export async function createLocalTrustedConnectorTargetMatcher(
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
