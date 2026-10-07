import { createHash } from "node:crypto";
import type { RepositoryDownloadAsset } from "cms-repository/repository/publication/types";

export function boundedStream(body: ReadableStream<Uint8Array>, maximum: number): ReadableStream<Uint8Array> {
    let received = 0;
    const reader = body.getReader();
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            const part = await reader.read();
            if (part.done) {
                reader.releaseLock();
                controller.close();
                return;
            }
            received += part.value.byteLength;
            if (received > maximum) {
                await reader.cancel();
                reader.releaseLock();
                controller.error(new Error("Repository response exceeds its declared byte limit"));
                return;
            }
            controller.enqueue(part.value);
        },
        async cancel(reason) {
            await reader.cancel(reason);
            reader.releaseLock();
        },
    });
}

export async function verifiedAsset(bytes: Blob | Uint8Array, definition: RepositoryDownloadAsset): Promise<boolean> {
    const copy = bytes instanceof Blob ? bytes : Uint8Array.from(bytes);
    const blob = copy instanceof Blob ? copy : new Blob([copy.buffer]);
    if (blob.size !== definition.byteLength) {
        return false;
    }
    const hash = createHash("sha256");
    const reader = blob.stream().getReader();
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done) {
                break;
            }
            hash.update(part.value);
        }
    } finally {
        reader.releaseLock();
    }
    return `sha256:${hash.digest("hex")}` === definition.digest;
}
