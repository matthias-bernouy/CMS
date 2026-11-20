import { CaptureError } from "../core/limits";

export const JOB_BYTES = 96 * 1024 * 1024;
export const RESULT_BYTES = 6 * 1024 * 1024;

export async function readJson(stream: ReadableStream<Uint8Array> | null, maximum: number, signal?: AbortSignal) {
    if (!stream) {
        throw new CaptureError("INVALID_INPUT");
    }
    const reader = stream.getReader();
    const cancel = () => void reader.cancel().catch(() => undefined);
    signal?.addEventListener("abort", cancel, { once: true });
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        signal?.throwIfAborted();
        for (;;) {
            const part = await reader.read();
            signal?.throwIfAborted();
            if (part.done) {
                break;
            }
            length += part.value.byteLength;
            if (length > maximum) {
                throw new CaptureError("LIMIT_EXCEEDED");
            }
            chunks.push(part.value);
        }
        try {
            return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
        } catch {
            throw new CaptureError("INVALID_INPUT");
        }
    } finally {
        signal?.removeEventListener("abort", cancel);
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}
