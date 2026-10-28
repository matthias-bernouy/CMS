/** Observe consumption without buffering or changing backpressure. */
export function observeStream(stream: ReadableStream<Uint8Array>, finish: (outcome: string, bytes: number) => void) {
    const reader = stream.getReader();
    let bytes = 0;
    let terminal = false;
    let released = false;
    const release = () => {
        if (!released) {
            released = true;
            reader.releaseLock();
        }
    };
    const close = (outcome: string) => {
        if (!terminal) {
            terminal = true;
            finish(outcome, bytes);
        }
    };
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const part = await reader.read();
                if (terminal) {
                    return;
                }
                if (part.done) {
                    close("completed");
                    release();
                    controller.close();
                } else {
                    bytes += part.value.byteLength;
                    controller.enqueue(part.value);
                }
            } catch (error) {
                if (!terminal) {
                    close("stream-error");
                    release();
                    controller.error(error);
                }
            }
        },
        async cancel(reason) {
            close("cancelled");
            try {
                await reader.cancel(reason);
            } finally {
                release();
            }
        },
    });
}
