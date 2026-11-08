import { createHash } from "node:crypto";

/** Hash captured immutable bytes without allocating another complete archive buffer. */
export async function resourceArchiveDigest(bytes: Blob, signal?: AbortSignal): Promise<`sha256:${string}`> {
    const hash = createHash("sha256");
    for await (const chunk of bytes.stream()) {
        signal?.throwIfAborted();
        hash.update(chunk);
    }
    signal?.throwIfAborted();
    return `sha256:${hash.digest("hex")}`;
}
