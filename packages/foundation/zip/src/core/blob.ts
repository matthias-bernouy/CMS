import { ZipValidationError } from "./errors";

/** A filesystem-backed Blob can change after stat; observe bytes before allocating a complete buffer. */
export async function captureBlobBytes(
    blob: Blob,
    maxBytes: number,
    signal?: AbortSignal,
): Promise<Buffer<ArrayBuffer>> {
    signal?.throwIfAborted();
    const reader = blob.stream().getReader();
    const abort = () => {
        void reader.cancel(signal?.reason).catch(() => undefined);
    };
    signal?.addEventListener("abort", abort, { once: true });
    const parts: Buffer[] = [];
    let size = 0;
    try {
        for (;;) {
            signal?.throwIfAborted();
            const { done, value } = await reader.read();
            signal?.throwIfAborted();
            if (done) {
                break;
            }
            size += value.byteLength;
            if (size > maxBytes) {
                throw new ZipValidationError("limit_exceeded", "ZIP input exceeds its observed byte limit");
            }
            parts.push(Buffer.from(value));
        }
        return Buffer.concat(parts, size);
    } catch (error) {
        signal?.throwIfAborted();
        throw error;
    } finally {
        signal?.removeEventListener("abort", abort);
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}
