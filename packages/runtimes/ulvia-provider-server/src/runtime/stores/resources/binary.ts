import { ResourceArchiveError } from "@bernouy/resources";

/** Files may grow after stat; observe a bounded stream before making a worker buffer. */
export async function captureResourceBytes(
    blob: Blob,
    signal?: AbortSignal,
    reserve?: (bytes: number) => void,
    limit = 64 * 1024 * 1024,
): Promise<Uint8Array> {
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
            if (size > limit) {
                throw new ResourceArchiveError("Resource archive exceeds its observed byte limit");
            }
            reserve?.(size);
            parts.push(Buffer.from(value));
        }
        return Buffer.concat(parts, size);
    } finally {
        signal?.removeEventListener("abort", abort);
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}
