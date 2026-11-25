import { MAINTENANCE_LIMITS } from "./limits";

/** Cancel on every exit, including a deadline while waiting for the next stream chunk. */
export async function readMaintenanceResource(
    response: Response,
    signal: AbortSignal,
    reserve: (bytes: number) => void,
) {
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const reader = response.body?.getReader();
    const cancel = () => {
        void reader?.cancel(signal.reason).catch(() => undefined);
    };
    signal.addEventListener("abort", cancel, { once: true });
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        signal.throwIfAborted();
        if (
            response.status !== 200 ||
            !/^(?:text\/css(?:;|$)|image\/|font\/|application\/(?:font-|vnd\.ms-fontobject|octet-stream))/iu.test(
                contentType,
            )
        ) {
            throw new Error("Maintenance Page resource is not a publicly available visual resource");
        }
        for (;;) {
            const part = await reader?.read();
            signal.throwIfAborted();
            if (!part || part.done) {
                break;
            }
            length += part.value.byteLength;
            reserve(part.value.byteLength);
            if (length > MAINTENANCE_LIMITS.resourceBytes) {
                throw new Error("Maintenance resource exceeds its byte limit");
            }
            chunks.push(part.value);
        }
        return { contentType, blob: new Blob(chunks.map((chunk) => new Uint8Array(chunk))) };
    } finally {
        signal.removeEventListener("abort", cancel);
        await reader?.cancel().catch(() => undefined);
        reader?.releaseLock();
    }
}
