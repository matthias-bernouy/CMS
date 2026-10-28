import { AsyncLocalStorage } from "node:async_hooks";
import { isTraceContext, type TraceContext } from "./traceValues";
const traces = new AsyncLocalStorage<TraceContext>();
export const currentTraceContext = (): TraceContext | undefined => traces.getStore();
export function runWithTraceContext<T>(context: TraceContext, operation: () => T): T {
    if (!isTraceContext(context)) {
        throw new TypeError("Invalid trace context");
    }
    return traces.run(Object.freeze({ ...context }), operation);
}
export function runWithoutTraceContext<T>(operation: () => T): T {
    return traces.exit(operation);
}
