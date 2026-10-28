import { currentTraceContext, runWithTraceContext } from "@bernouy/logging/tracing";
import type { Logger } from "@bernouy/logging";
export function contentPhaseObserver(logger: Logger) {
    return async <T>(phase: string, operation: () => Promise<T>): Promise<T> => {
        const parent = currentTraceContext();
        const invocationId = crypto.randomUUID();
        const trace = {
            traceId: parent?.traceId ?? invocationId,
            spanId: invocationId,
            ...(parent ? { parentSpanId: parent.spanId } : {}),
        };
        return runWithTraceContext(trace, async () => {
            const startedAt = performance.now();
            let outcome = "completed";
            try {
                return await operation();
            } catch (error) {
                outcome = "failed";
                throw error;
            } finally {
                try {
                    logger.info("content.delivery.phase", {
                        traceId: trace.traceId,
                        invocationId,
                        ...(parent ? { parentInvocationId: parent.spanId } : {}),
                        phase,
                        outcome,
                        durationMs: performance.now() - startedAt,
                    });
                } catch {
                    /* Diagnostics never replace a resource result. */
                }
            }
        });
    };
}
