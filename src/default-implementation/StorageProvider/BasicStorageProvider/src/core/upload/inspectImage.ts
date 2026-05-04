import { imageSize } from "image-size";

import type { StorageProvider } from "../../exports/StorageProvider";

/**
 * Buffers the just-written blob and runs `image-size` to extract its native
 * dimensions. Returns `null` when the file isn't a parseable image — the
 * caller falls back to the generic file branch in that case.
 */
export async function inspectImage(
    provider: StorageProvider,
    bucketId: string,
    storagePath: string,
): Promise<{ width: number; height: number } | null> {
    const stream = await provider.blobStorage.read(bucketId, storagePath);
    if (!stream) return null;

    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const buf = concat(chunks);
    try {
        const dims = imageSize(buf);
        if (typeof dims.width === "number" && typeof dims.height === "number") {
            return { width: dims.width, height: dims.height };
        }
    } catch {
        // image-size throws on unrecognised formats — treat as "not an image".
    }
    return null;
}

function concat(chunks: Uint8Array[]): Uint8Array {
    const total = chunks.reduce((s, c) => s + c.byteLength, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
        out.set(c, off);
        off += c.byteLength;
    }
    return out;
}
