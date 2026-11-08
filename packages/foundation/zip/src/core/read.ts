import { fromBufferPromise } from "yauzl";
import type { DecodedZip, ZipEntry, ZipOptions } from "zip/interfaces/zip";
import { zipLimits } from "./limits";
import { ZipPaths, entryKind } from "./entries";
import { ZipValidationError } from "./errors";
import { collectZipStream } from "./streams";

/** Decode ordinary stored/deflated ZIP data without extracting files or executing contents. */
export async function readZip(input: Blob | Uint8Array, options: ZipOptions = {}): Promise<DecodedZip> {
    const limits = zipLimits(options.limits);
    const signal = options.signal;
    signal?.throwIfAborted();
    const archiveBytes = input instanceof Blob ? input.size : input.byteLength;
    if (archiveBytes > limits.maxArchiveBytes) {
        throw new ZipValidationError("limit_exceeded", "ZIP archive exceeds its byte limit");
    }
    const bytes = input instanceof Blob ? Buffer.from(await input.arrayBuffer()) : Buffer.from(input);
    signal?.throwIfAborted();
    try {
        const reader = await fromBufferPromise(bytes, { strictFileNames: true, validateEntrySizes: true });
        const entries: ZipEntry[] = [];
        const paths = new ZipPaths(limits);
        let totalBytes = 0;
        let count = 0;
        try {
            if (!Number.isSafeInteger(reader.entryCount) || reader.entryCount > limits.maxEntries) {
                throw new ZipValidationError("limit_exceeded", "ZIP archive exceeds its entry count");
            }
            for await (const entry of reader.eachEntry()) {
                signal?.throwIfAborted();
                if (++count > limits.maxEntries) {
                    throw new ZipValidationError("limit_exceeded", "ZIP archive exceeds its entry count");
                }
                const directory = entryKind(entry) === "directory";
                const path = paths.add(entry.fileName, directory);
                if (
                    !Number.isSafeInteger(entry.uncompressedSize) ||
                    entry.uncompressedSize < 0 ||
                    entry.uncompressedSize > limits.maxEntryBytes ||
                    totalBytes + entry.uncompressedSize > limits.maxTotalBytes
                ) {
                    throw new ZipValidationError("limit_exceeded", "ZIP entry exceeds its declared byte limits");
                }
                const stream = await reader.openReadStreamPromise(entry);
                const content = await collectZipStream(
                    stream,
                    Math.min(entry.uncompressedSize, limits.maxEntryBytes, limits.maxTotalBytes - totalBytes),
                    signal,
                );
                if (content.size !== entry.uncompressedSize || content.checksum !== entry.crc32) {
                    throw new ZipValidationError(
                        "integrity_mismatch",
                        "ZIP entry size or CRC32 does not match its bytes",
                    );
                }
                totalBytes += content.size;
                if (!directory) {
                    entries.push(Object.freeze({ path, bytes: content.bytes }));
                }
            }
            signal?.throwIfAborted();
            return Object.freeze({ entries: Object.freeze(entries), archiveBytes, totalBytes });
        } finally {
            reader.close();
        }
    } catch (error) {
        signal?.throwIfAborted();
        if (error instanceof ZipValidationError) {
            throw error;
        }
        throw new ZipValidationError("invalid_archive", "Malformed or corrupt ZIP archive", { cause: error });
    }
}
