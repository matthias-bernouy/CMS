import { CMS_CORRELATION_HEADER } from "@bernouy/http-runner/observability";
import type { ExecutorDeps } from "cms-sources/core/execution/executeEndpoint";
import type { SourceEndpoint } from "cms-sources/interfaces/Source";
import type { SourceTimingStage } from "cms-sources/interfaces/SourceObservability";

export function timedExecution<T>(
    deps: ExecutorDeps | undefined,
    stage: SourceTimingStage,
    operation: () => T | Promise<T>,
): Promise<T> {
    return deps?.observability ? deps.observability.measure(stage, operation) : Promise.resolve(operation());
}

export function withTimedSecretResolver(deps: ExecutorDeps | undefined): ExecutorDeps | undefined {
    if (!deps?.resolveSecret || !deps.observability) {
        return deps;
    }
    return {
        ...deps,
        resolveSecret: (ref) => deps.observability!.measure("cms_secret", () => deps.resolveSecret!(ref)),
    };
}

export function applyInternalCorrelationHeader(
    endpoint: SourceEndpoint,
    targetUrl: string,
    headers: Headers,
    deps: ExecutorDeps | undefined,
): void {
    headers.delete(CMS_CORRELATION_HEADER);
    if (!deps?.observability || !deps.isTrustedConnectorTarget) {
        return;
    }
    try {
        const target = new URL(targetUrl);
        if (deps.isTrustedConnectorTarget(endpoint, target)) {
            headers.set(CMS_CORRELATION_HEADER, deps.observability.correlationId);
        }
    } catch {
        // Internal headers fail closed when target provenance cannot be verified.
    }
}
