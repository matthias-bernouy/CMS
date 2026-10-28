import { currentTraceContext, runWithTraceContext, runWithoutTraceContext } from "@bernouy/logging/tracing";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Middleware } from "http-runner/interfaces/Runner";

export const REQUEST_ID_HEADER = "x-request-id";

export type HttpRequestContext = Readonly<{
    requestId: string;
}>;

type InternalHttpRequestContext = HttpRequestContext & Readonly<{ request: Request }>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const requestIds = new WeakMap<Request, string>();
const contexts = new AsyncLocalStorage<InternalHttpRequestContext>();

export function isValidRequestId(value: string): boolean {
    return UUID_V4.test(value);
}

export function requestId(request: Request): string {
    const existing = requestIds.get(request);
    if (existing) {
        return existing;
    }
    const inbound = request.headers.get(REQUEST_ID_HEADER);
    const value = inbound && isValidRequestId(inbound) ? inbound : crypto.randomUUID();
    requestIds.set(request, value);
    return value;
}

export function existingRequestId(request: Request): string | undefined {
    return requestIds.get(request);
}

export function currentRequestContext(): HttpRequestContext | undefined {
    const context = contexts.getStore();
    return context ? Object.freeze({ requestId: context.requestId }) : undefined;
}

export function currentRequestId(): string | undefined {
    return contexts.getStore()?.requestId;
}

export function currentRequestLogAttributes(): Readonly<Record<string, string>> | undefined {
    const context = contexts.getStore();
    const trace = currentTraceContext();
    return context
        ? {
              requestId: context.requestId,
              ...(trace
                  ? {
                        traceId: trace.traceId,
                        invocationId: trace.spanId,
                        ...(trace.parentSpanId ? { parentInvocationId: trace.parentSpanId } : {}),
                    }
                  : {}),
          }
        : undefined;
}

/** Internal seam used by request-scoped diagnostics without leaking Request through the public context. */
export function currentTimingRequest(): Request | undefined {
    return contexts.getStore()?.request;
}

/** Add the active inbound request ID to an outbound request without forwarding caller-supplied spoofed values. */
export function currentRequestHeaders(headers?: HeadersInit): Headers {
    const result = new Headers(headers);
    const value = currentRequestId();
    if (value) {
        result.set(REQUEST_ID_HEADER, value);
    }
    return result;
}

export function runWithRequestContext<T>(request: Request, operation: () => T): T {
    const id = requestId(request);
    return runWithTraceContext({ traceId: id, spanId: id }, () =>
        contexts.run(Object.freeze({ requestId: id, request }), operation),
    );
}

/** Detach timers and other durable background work from the request that happened to create them. */
export function runWithoutRequestContext<T>(operation: () => T): T {
    return runWithoutTraceContext(() => contexts.exit(operation));
}

export function createRequestIdMiddleware(): Middleware {
    return (request, next) => runWithRequestContext(request, async () => withRequestIdHeader(request, await next()));
}

export function withRequestIdHeader(request: Request, response: Response): Response {
    const value = existingRequestId(request);
    if (!value || response.headers.get(REQUEST_ID_HEADER) === value) {
        return response;
    }
    try {
        const headers = new Headers(response.headers);
        headers.set(REQUEST_ID_HEADER, value);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    } catch {
        return response;
    }
}
