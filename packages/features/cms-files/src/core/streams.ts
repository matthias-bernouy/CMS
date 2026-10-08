import { detectMediaSignature } from "@bernouy/binary-media";
import { createHash } from "node:crypto";
import { CmsFilesError } from "cms-files/core/credentials";

export function measureStream(
    source: ReadableStream<Uint8Array>,
    maximum: number,
): {
    stream: ReadableStream<Uint8Array>;
    result: Promise<{ size: number; hash: string; detectedMimeType?: string }>;
} {
    const hash = createHash("sha256");
    let size = 0;
    const prefix: number[] = [];
    let resolve!: (value: { size: number; hash: string; detectedMimeType?: string }) => void;
    let reject!: (error: unknown) => void;
    const result = new Promise<{ size: number; hash: string; detectedMimeType?: string }>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    const reader = source.getReader();
    const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const next = await reader.read();
                if (next.done) {
                    const detectedMimeType = detectMediaSignature(new Uint8Array(prefix))?.acceptedMediaTypes[0];
                    resolve({ size, hash: hash.digest("hex"), ...(detectedMimeType ? { detectedMimeType } : {}) });
                    controller.close();
                    return;
                }
                size += next.value.byteLength;
                if (size > maximum) {
                    throw new CmsFilesError("SIZE_MISMATCH", 409);
                }
                hash.update(next.value);
                for (const byte of next.value.slice(0, Math.max(0, 512 - prefix.length))) {
                    prefix.push(byte);
                }
                controller.enqueue(next.value);
            } catch (error) {
                reject(error);
                controller.error(error);
            }
        },
        async cancel(reason) {
            reject(reason);
            await reader.cancel(reason).catch(() => undefined);
        },
    });
    return { stream, result };
}

export function parseRange(value: string, size: number): { start: number; end: number } {
    if (size < 1 || value.includes(",")) {
        throw unsatisfiedRange(size);
    }
    const match = /^bytes=(\d*)-(\d*)$/u.exec(value);
    if (!match || (!match[1] && !match[2])) {
        throw unsatisfiedRange(size);
    }
    const suffix = !match[1] ? Number(match[2]) : undefined;
    const start = suffix === undefined ? Number(match[1]) : Math.max(0, size - suffix);
    const requestedEnd = match[2] && suffix === undefined ? Number(match[2]) : size - 1;
    const end = Math.min(requestedEnd, size - 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= size) {
        throw unsatisfiedRange(size);
    }
    return { start, end };
}

function unsatisfiedRange(size: number): CmsFilesError {
    return new CmsFilesError("RANGE_NOT_SATISFIABLE", 416, { "content-range": `bytes */${size}` });
}
