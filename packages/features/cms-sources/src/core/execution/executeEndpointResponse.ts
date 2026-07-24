import type { ExecutorDeps } from "cms-sources/core/execution/executeEndpoint";
import { projectEndpointResponse } from "cms-sources/core/response-projection/projectEndpointResponse";
import type { UndeclaredUpstreamStatus } from "cms-sources/core/upstream/upstreamFailure";
import type { SourceEndpoint } from "cms-sources/interfaces/Source";

export async function projectSourceResponse(
    endpoint: SourceEndpoint,
    request: Request,
    upstream: Response,
    deps: ExecutorDeps | undefined,
): Promise<Response> {
    const declared = hasResponseContract(endpoint, upstream.status);
    const legacyStrictFailure =
        !declared && deps?.reportFailure !== undefined && deps.responseProjectionMode !== "compatibility";
    const projected = await projectEndpointResponse(endpoint, request, upstream, {
        responseProjectionMode: legacyStrictFailure ? "strict" : deps?.responseProjectionMode,
        reportResponseProjectionEvent: deps?.reportResponseProjectionEvent,
        correlationId: deps?.observability?.correlationId,
    });
    if (!declared && deps?.reportFailure) {
        reportUndeclaredStatus(
            endpoint,
            upstream.status,
            projected,
            deps.reportFailure,
            deps.observability?.correlationId,
        );
    }
    return projected;
}

function hasResponseContract(endpoint: SourceEndpoint, status: number): boolean {
    return endpoint.output?.some((output) => output.status === String(status) || output.status === "default") === true;
}

function reportUndeclaredStatus(
    endpoint: SourceEndpoint,
    upstreamStatus: number,
    response: Response,
    reporter: (failure: UndeclaredUpstreamStatus) => void | Promise<void>,
    correlationId: string | undefined,
): void {
    const failure: UndeclaredUpstreamStatus = {
        correlationId: response.headers.get("x-correlation-id") ?? correlationId ?? crypto.randomUUID(),
        endpointUrn: endpoint.urn,
        kind: "undeclared_upstream_status",
        upstreamStatus,
    };
    try {
        void Promise.resolve(reporter(failure)).catch(() => undefined);
    } catch {
        // Observability must not change source response behaviour.
    }
}
