import type { EndpointPerformanceRecorder, EndpointPerformanceSurface } from "@bernouy/cms-analytics";
import { GatewayError, type GatewayInvoker } from "@bernouy/cms-gateway";

/** Keeps the existing endpoint performance dashboard useful for gateway calls. */
export function observeGatewayInvoker(
    invoker: GatewayInvoker,
    recorder: EndpointPerformanceRecorder,
    surface: EndpointPerformanceSurface,
): GatewayInvoker {
    return {
        async invoke(value) {
            const start = performance.now();
            const observedAt = new Date();
            let status = 503;
            try {
                const result = await invoker.invoke(value);
                status = result.status;
                return result;
            } catch (error) {
                if (error instanceof GatewayError) {
                    status =
                        error.code === "not_selected"
                            ? 404
                            : error.code === "outcome_unknown"
                              ? 409
                              : error.code === "not_authorized"
                                ? 403
                                : error.code === "invalid_input"
                                  ? 400
                                  : error.code === "invalid_provider_response" || error.code === "transport_failure"
                                    ? 502
                                    : 503;
                }
                throw error;
            } finally {
                recorder.observe({
                    ts: observedAt,
                    surface,
                    endpointUrn: `urn:${value.contractId}:${value.capabilityId}`,
                    method: "POST",
                    status,
                    stagesMs: { cms_total: performance.now() - start },
                });
            }
        },
    };
}
