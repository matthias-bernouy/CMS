import { record, scope } from "./records";
import type { ProviderOperationExecutor } from "@bernouy/ulvia-provider";

/** Observe the real durable handler; an accepted queue handle is not execution evidence. */
export function instrumentOperations(prototype: Pick<ProviderOperationExecutor, "register">): void {
    const register = prototype.register;
    prototype.register = function (contractId, capabilityId, handler, errors) {
        return register.call(
            this,
            contractId,
            capabilityId,
            async (input, context, execution) => {
                const traceId = context.trace?.traceId ?? context.rootRequestId ?? context.requestId;
                return scope.run({ traceId, spanId: context.requestId }, async () => {
                    const started = performance.now();
                    let success = false;
                    try {
                        const result = await handler(input, context, execution);
                        success = true;
                        return result;
                    } finally {
                        record({
                            kind: "operation",
                            contractId,
                            capabilityId,
                            contractVersion: context.contractVersion,
                            success,
                            durationMs: performance.now() - started,
                        });
                    }
                });
            },
            errors,
        );
    };
    record({ kind: "instrumentation", component: "operations" });
}
