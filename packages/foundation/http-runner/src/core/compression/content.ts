import { CryptoHasher, gzipSync } from "bun";
import { brotliCompressSync } from "node:zlib";
import type { CacheEntry } from "http-runner/interfaces/Cache";

export function compress(raw: string | ArrayBuffer | Uint8Array, contentType: string): CacheEntry {
    const rawBytes = typeof raw === "string" ? new TextEncoder().encode(raw) : new Uint8Array(raw);
    const brotliResult = brotliCompressSync(rawBytes);

    // Ten hex chars are sufficient for a cache-busting token. A collision can
    // only retain one stale asset; it cannot alter the content digest itself.
    const hash = new CryptoHasher("sha256").update(rawBytes).digest("hex").slice(0, 10);

    return {
        raw: rawBytes,
        brotli: new Uint8Array(brotliResult.buffer, brotliResult.byteOffset, brotliResult.byteLength),
        gzip: new Uint8Array(gzipSync(rawBytes)),
        contentType,
        hash,
    };
}
