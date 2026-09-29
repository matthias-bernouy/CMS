import { withAbort } from "cms-gateway/invocation/http/withAbort";

/** Bounds bytes and time, cancelling a body reader when either limit is exceeded. */
export async function readBounded(response: Response, maximum: number, signal: AbortSignal): Promise<Uint8Array> {
    if (signal.aborted) {
        throw signal.reason;
    }
    const reader = response.body?.getReader();
    if (!reader) {
        return new Uint8Array();
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const { done, value } = await withAbort(() => reader.read(), signal);
            if (done) {
                break;
            }
            length += value.byteLength;
            if (length > maximum) {
                void reader.cancel().catch(() => undefined);
                throw new TypeError("provider response exceeds the configured byte limit");
            }
            chunks.push(value);
        }
    } finally {
        if (signal.aborted) {
            void reader.cancel().catch(() => undefined);
        }
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}
