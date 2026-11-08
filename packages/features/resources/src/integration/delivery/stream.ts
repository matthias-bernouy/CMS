/** One borrowed reader, at most one queued chunk, and exact observed response bytes. */
export function resourceAssetStream(
    source: ReadableStream<Uint8Array>,
    length: number,
    signal: AbortSignal,
): ReadableStream<Uint8Array> {
    const reader = source.getReader();
    let remaining = length;
    let closed = false;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const release = () => {
        signal.removeEventListener("abort", abort);
        reader.releaseLock();
    };
    const cancel = async (reason: unknown) => {
        if (closed) {
            return;
        }
        closed = true;
        try {
            await reader.cancel(reason);
        } finally {
            release();
        }
    };
    const abort = () => {
        controller.error(signal.reason);
        void cancel(signal.reason).catch(() => {});
    };
    return new ReadableStream<Uint8Array>(
        {
            start(output) {
                controller = output;
                signal.addEventListener("abort", abort, { once: true });
                if (signal.aborted) {
                    abort();
                }
            },
            async pull(output) {
                try {
                    const chunk = await reader.read();
                    if (closed) {
                        return;
                    }
                    if (chunk.done) {
                        if (remaining !== 0) {
                            throw new Error("Resource asset stream ended before its declared length");
                        }
                        closed = true;
                        release();
                        output.close();
                        return;
                    }
                    if (chunk.value.byteLength > remaining) {
                        throw new Error("Resource asset stream exceeds its declared length");
                    }
                    remaining -= chunk.value.byteLength;
                    output.enqueue(chunk.value);
                } catch (error) {
                    if (!closed) {
                        output.error(error);
                        await cancel(error);
                    }
                }
            },
            cancel,
        },
        { highWaterMark: 0 },
    );
}
