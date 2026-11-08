import { addAbortSignal } from "node:stream";
import type { Readable } from "node:stream";
import { crc32 } from "node:zlib";
import { ZipValidationError } from "./errors";

/** One borrowed stream, bounded before retaining each chunk; no output escapes before full verification. */
export async function collectZipStream(stream: Readable, maxBytes: number, signal?: AbortSignal) {
    if (signal) {
        addAbortSignal(signal, stream);
    }
    const parts: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    let checksum = 0;
    try {
        signal?.throwIfAborted();
        for await (const chunk of stream) {
            signal?.throwIfAborted();
            if (!(chunk instanceof Uint8Array)) {
                throw new ZipValidationError("invalid_archive", "ZIP stream returned nonbinary content");
            }
            size += chunk.byteLength;
            if (size > maxBytes) {
                throw new ZipValidationError("limit_exceeded", "ZIP stream exceeds its byte limit");
            }
            checksum = crc32(chunk, checksum);
            parts.push(new Uint8Array(chunk));
        }
        signal?.throwIfAborted();
        return { bytes: new Blob(parts), checksum, size };
    } catch (error) {
        signal?.throwIfAborted();
        throw error;
    } finally {
        stream.destroy();
    }
}
