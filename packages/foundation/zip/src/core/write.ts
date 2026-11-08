import type { Readable } from "node:stream";
import { ZipFile } from "yazl";
import type { ZipSourceEntry, ZipOptions } from "zip/interfaces/zip";
import { zipLimits } from "./limits";
import { ZipPaths } from "./entries";
import { ZipValidationError } from "./errors";
import { collectZipStream } from "./streams";

/** Reproducible stored entries: sorted paths, fixed DOS date/mode, no environment metadata. */
export async function writeZip(entries: readonly ZipSourceEntry[], options: ZipOptions = {}): Promise<Blob> {
    const limits = zipLimits(options.limits);
    const signal = options.signal;
    signal?.throwIfAborted();
    if (entries.length > limits.maxEntries) {
        throw new ZipValidationError("limit_exceeded", "ZIP source exceeds its entry count");
    }
    const paths = new ZipPaths(limits);
    let total = 0;
    // Capture every path and mutable byte array before the first await.
    const captured = entries
        .map((entry) => {
            const path = paths.add(entry.path, false);
            const value = entry.bytes;
            const size =
                value instanceof Blob
                    ? value.size
                    : typeof value === "string"
                      ? Buffer.byteLength(value)
                      : value.byteLength;
            total += size;
            if (size > limits.maxEntryBytes || total > limits.maxTotalBytes) {
                throw new ZipValidationError("limit_exceeded", "ZIP source exceeds its byte limits");
            }
            return {
                path,
                bytes:
                    value instanceof Blob
                        ? value
                        : new Blob([typeof value === "string" ? value : new Uint8Array(value)]),
            };
        })
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const zip = new ZipFile();
    // yazl exposes a PassThrough using the older NodeJS.ReadableStream declaration.
    const stream = zip.outputStream as Readable;
    const failed = (error: Error) => stream.destroy(error);
    zip.on("error", failed);
    const output = collectZipStream(stream, limits.maxArchiveBytes, signal);
    // Attach a rejection handler before awaiting source Blobs; the original promise
    // is still awaited below so an early stream refusal cannot become success.
    void output.catch(() => undefined);
    try {
        for (const entry of captured) {
            signal?.throwIfAborted();
            zip.addBuffer(Buffer.from(await entry.bytes.arrayBuffer()), entry.path, {
                compress: false,
                mtime: new Date(1980, 0, 1),
                mode: 0o100644,
                forceDosTimestamp: true,
            });
        }
        zip.end();
        return (await output).bytes;
    } catch (error) {
        stream.destroy(error instanceof Error ? error : new Error("ZIP construction aborted"));
        await output.catch(() => undefined);
        signal?.throwIfAborted();
        throw error;
    } finally {
        zip.off("error", failed);
    }
}
