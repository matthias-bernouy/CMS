import { currentTraceContext, runWithTraceContext } from "@bernouy/logging/tracing";
import type { Logger } from "@bernouy/logging";
import type { InvocationObserver } from "cms-gateway/invocation/observability/interfaces";
export function gatewayObservability(logger: Logger) {
    const observer: InvocationObserver = ({ spanId, parentSpanId, phases, ...event }) =>
        logger.info("gateway.invocation.completed", {
            ...event,
            phases: Object.entries(phases).map(([phase, durationMs]) => ({ phase, durationMs })),
            invocationId: spanId,
            ...(parentSpanId ? { parentInvocationId: parentSpanId } : {}),
        });
    return { observer, tracing: { current: currentTraceContext, run: runWithTraceContext } };
}
