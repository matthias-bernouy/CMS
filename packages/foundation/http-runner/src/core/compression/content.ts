import { CryptoHasher, gzipSync } from "bun";
import { brotliCompressSync } from "node:zlib";
import type { CacheEntry } from "http-runner/interfaces/Cache";

type CompressionCodecs = { brotli(bytes: Uint8Array): Uint8Array; gzip(bytes: Uint8Array): Uint8Array };
const CODECS: CompressionCodecs = { brotli: brotliCompressSync, gzip: (bytes) => gzipSync(new Uint8Array(bytes)) };
export function compress(
    raw: string | ArrayBuffer | Uint8Array,
    contentType: string,
    codecs: CompressionCodecs = CODECS,
): CacheEntry {
    const rawBytes = typeof raw === "string" ? new TextEncoder().encode(raw) : new Uint8Array(raw);
    let brotli: Uint8Array | undefined;
    let gzip: Uint8Array | undefined;

    // Ten hex chars are sufficient for a cache-busting token. A collision can
    // only retain one stale asset; it cannot alter the content digest itself.
    const hash = new CryptoHasher("sha256").update(rawBytes).digest("hex").slice(0, 10);

    return {
        raw: rawBytes,
        get brotli() {
            return (brotli ??= new Uint8Array(codecs.brotli(rawBytes)));
        },
        get gzip() {
            return (gzip ??= new Uint8Array(codecs.gzip(rawBytes)));
        },
        contentType,
        hash,
    };
}
