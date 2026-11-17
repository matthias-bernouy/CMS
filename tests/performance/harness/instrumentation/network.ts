import { ClientRequest, IncomingMessage } from "node:http";
import { record, scope } from "./records";
import type { Scope } from "./records";

/** Count streamed bodies while preserving consumption, backpressure, cancellation and response metadata. */
export function instrumentNetwork(currentTrace: () => string | undefined): void {
    const original = globalThis.fetch;
    globalThis.fetch = Object.assign(async (...args: Parameters<typeof fetch>) => {
        const target = args[0];
        const path = new URL(
            String(typeof target === "string" || target instanceof URL ? target : target.url),
            "http://probe.invalid",
        ).pathname;
        const context = { ...(scope.getStore() ?? { traceId: currentTrace() ?? "unattributed" }), path };
        record({ kind: "http", ...context, path });
        const response = await original(...args);
        if (!response.body) {
            record({ kind: "http-body", ...context, bytes: 0, complete: true });
            return response;
        }
        const reader = response.body.getReader();
        let bytes = 0;
        const body = new ReadableStream<Uint8Array>({
            async pull(controller) {
                try {
                    const chunk = await reader.read();
                    if (chunk.done) {
                        reader.releaseLock();
                        record({ kind: "http-body", ...context, bytes, complete: true });
                        controller.close();
                    } else {
                        bytes += chunk.value.byteLength;
                        controller.enqueue(chunk.value);
                    }
                } catch (error) {
                    record({ kind: "http-body", ...context, bytes, complete: false });
                    reader.releaseLock();
                    controller.error(error);
                }
            },
            async cancel(reason) {
                try {
                    await reader.cancel(reason);
                } finally {
                    reader.releaseLock();
                    record({ kind: "http-body", ...context, bytes, complete: false });
                }
            },
        });
        const wrapped = new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
        for (const name of ["url", "redirected", "type"] as const) {
            Object.defineProperty(wrapped, name, { value: response[name] });
        }
        return wrapped;
    }, original);
    const responses = new WeakMap<IncomingMessage, { context: Scope & { path: string }; bytes: number }>();
    const emit = ClientRequest.prototype.emit;
    ClientRequest.prototype.emit = function (event: string | symbol, ...args: unknown[]) {
        if (event === "response" && args[0] instanceof IncomingMessage) {
            const path = new URL(this.path, "http://probe.invalid").pathname;
            const context = { ...(scope.getStore() ?? { traceId: currentTrace() ?? "unattributed" }), path };
            responses.set(args[0], { context, bytes: 0 });
            record({ kind: "http", ...context, path: new URL(this.path, "http://probe.invalid").pathname });
        }
        return emit.call(this, event, ...args);
    };
    const push = IncomingMessage.prototype.push;
    IncomingMessage.prototype.push = function (chunk, encoding) {
        const response = responses.get(this);
        if (response) {
            if (chunk === null) {
                record({ kind: "http-body", ...response.context, bytes: response.bytes, complete: true });
                responses.delete(this);
            } else {
                response.bytes += typeof chunk === "string" ? Buffer.byteLength(chunk, encoding) : chunk.byteLength;
            }
        }
        return push.call(this, chunk, encoding);
    };
    record({ kind: "instrumentation", component: "network" });
}
