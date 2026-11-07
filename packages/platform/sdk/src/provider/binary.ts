import type { CapabilityDefinition } from "@bernouy/ulvia-contracts";
import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";

function limitBinaryStream(
    source: ReadableStream<Uint8Array>,
    maximum: number,
    signal?: AbortSignal,
): ReadableStream<Uint8Array> {
    let received = 0;
    return source.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                if (!(chunk instanceof Uint8Array) || chunk.byteLength > maximum - received) {
                    throw new TypeError("Binary stream exceeds its admitted byte bound");
                }
                received += chunk.byteLength;
                controller.enqueue(chunk);
            },
        }),
        signal ? { signal } : {},
    );
}

export function binaryInputLease(capability: CapabilityDefinition, context: ProviderCapabilityInvocationContext) {
    if (!context.binaryBody) {
        return { context, close() {} };
    }
    const leaves = Object.values(capability.input.properties).filter((schema) => schema.type === "binary");
    if (leaves.length !== 1 || leaves[0]!.type !== "binary") {
        throw new TypeError("Binary body does not match the admitted capability");
    }
    const maximum = leaves[0]!.maxBytes;
    const body = context.binaryBody;
    if (
        body.contentLength !== undefined &&
        (!Number.isSafeInteger(body.contentLength) || body.contentLength < 0 || body.contentLength > maximum)
    ) {
        void body.stream.cancel().catch(() => undefined);
        throw new TypeError("Binary input length exceeds its admitted byte bound");
    }
    const lifetime = new AbortController();
    const signal = context.signal ? AbortSignal.any([context.signal, lifetime.signal]) : lifetime.signal;
    return {
        context: { ...context, binaryBody: { ...body, stream: limitBinaryStream(body.stream, maximum, signal) } },
        close() {
            lifetime.abort();
        },
    };
}

export function boundBinaryResponse(
    response: Response,
    maximum: number,
    success: readonly number[],
    signal?: AbortSignal,
): Response {
    if (!response.body || !success.includes(response.status)) {
        return response;
    }
    const length = response.headers.get("content-length");
    if (
        length !== null &&
        (!/^(?:0|[1-9][0-9]*)$/u.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > maximum)
    ) {
        void response.body.cancel().catch(() => undefined);
        throw new TypeError("Binary response length exceeds its admitted byte bound");
    }
    return new Response(limitBinaryStream(response.body, maximum, signal), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}
