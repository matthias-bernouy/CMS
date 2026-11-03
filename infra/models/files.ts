import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";

export type ModelFile = { path: string; url: string; bytes: number; sha256: string };
export type ModelRequest = (url: string, options: RequestInit) => Promise<Response>;

export async function verifiedFile(path: string, file: ModelFile): Promise<boolean> {
    const info = await stat(path).catch(() => undefined);
    if (!info?.isFile() || info.size !== file.bytes) {
        return false;
    }
    const hash = createHash("sha256");
    for await (const chunk of Bun.file(path).stream()) {
        hash.update(chunk);
    }
    return hash.digest("hex") === file.sha256;
}

/** Never expose an incomplete download as a reusable cache entry. */
export async function downloadFile(path: string, file: ModelFile, request: ModelRequest): Promise<void> {
    const temporary = `${path}.${randomUUID()}.part`;
    await mkdir(dirname(path), { recursive: true });
    try {
        const response = await request(file.url, { signal: AbortSignal.timeout(300_000) });
        if (!response.ok || !response.body) {
            await response.body?.cancel();
            throw new Error(`Model download failed (${response.status}): ${file.path}`);
        }
        const hash = createHash("sha256");
        let size = 0;
        const bounded = response.body.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
                transform(chunk, controller) {
                    size += chunk.byteLength;
                    if (size > file.bytes) {
                        throw new Error(`Model file exceeds its declared size: ${file.path}`);
                    }
                    hash.update(chunk);
                    controller.enqueue(chunk);
                },
            }),
        );
        await Bun.write(temporary, new Response(bounded));
        if (size !== file.bytes || hash.digest("hex") !== file.sha256) {
            throw new Error(`Model file integrity mismatch: ${file.path}`);
        }
        await rename(temporary, path);
    } finally {
        await rm(temporary, { force: true });
    }
}
