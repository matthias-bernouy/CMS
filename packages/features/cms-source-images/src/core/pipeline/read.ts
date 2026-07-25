import { SourceImageFailure } from "./validation";

export async function readBoundedImage(response: Response, maxBytes: number, timeoutMs: number): Promise<Uint8Array> {
    const declared = response.headers.get("content-length");
    if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
        await response.body?.cancel().catch(() => undefined);
        throw new SourceImageFailure("source_too_large", "source image exceeds the byte limit");
    }
    if (!response.body) {
        throw new SourceImageFailure("invalid_image", "source image body is missing");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        void reader.cancel("source image read timeout").catch(() => undefined);
    }, timeoutMs);
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            if (!value) {
                continue;
            }
            size += value.byteLength;
            if (size > maxBytes) {
                await reader.cancel("source image byte limit").catch(() => undefined);
                throw new SourceImageFailure("source_too_large", "source image exceeds the byte limit");
            }
            chunks.push(value);
        }
    } catch (error) {
        if (timedOut) {
            throw new SourceImageFailure("read_timeout", "source image read timed out");
        }
        throw error;
    } finally {
        clearTimeout(timer);
        reader.releaseLock();
    }
    if (timedOut) {
        throw new SourceImageFailure("read_timeout", "source image read timed out");
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}
