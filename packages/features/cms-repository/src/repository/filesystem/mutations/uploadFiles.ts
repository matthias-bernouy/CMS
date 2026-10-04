import { createHash, randomUUID } from "node:crypto";
import { open, readFile, rename, rm, writeFile } from "node:fs/promises";
import type { RepositoryPublicationResult } from "cms-repository/repository/publication/types";

export async function writeUploadStream(path: string, body: ReadableStream<Uint8Array> | null, maximum: number) {
    const handle = await open(path, "wx", 0o600);
    const hash = createHash("sha256");
    let byteLength = 0;
    const reader = body?.getReader();
    try {
        for (;;) {
            const part = reader ? await reader.read() : { done: true as const, value: undefined };
            if (part.done) {
                break;
            }
            byteLength += part.value.byteLength;
            if (byteLength > maximum) {
                await reader?.cancel();
                throw new Error("Publication upload asset exceeds its declared byte length");
            }
            hash.update(part.value);
            await writeAll(handle, part.value);
        }
    } finally {
        reader?.releaseLock();
        await handle.close();
    }
    return { byteLength, digest: `sha256:${hash.digest("hex")}` };
}

export async function digestUploadFile(path: string) {
    const file = Bun.file(path);
    const hash = createHash("sha256");
    const reader = file.stream().getReader();
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done) {
                break;
            }
            hash.update(part.value);
        }
    } finally {
        reader.releaseLock();
    }
    return { byteLength: file.size, digest: `sha256:${hash.digest("hex")}` };
}

export async function writeUploadResult(path: string, value: RepositoryPublicationResult): Promise<void> {
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
    try {
        await rename(temporary, path);
    } finally {
        await rm(temporary, { force: true });
    }
}

export async function readUploadResult(path: string): Promise<RepositoryPublicationResult | null> {
    const bytes = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (bytes === null) {
        return null;
    }
    const value = JSON.parse(bytes) as RepositoryPublicationResult;
    if (
        !value ||
        !["collection", "contract", "provider-manifest"].includes(value.kind) ||
        typeof value.added !== "boolean" ||
        !/^sha256:[0-9a-f]{64}$/u.test(value.digest)
    ) {
        throw new Error("Invalid publication upload result");
    }
    return value;
}

async function writeAll(handle: Awaited<ReturnType<typeof open>>, bytes: Uint8Array): Promise<void> {
    let offset = 0;
    while (offset < bytes.byteLength) {
        const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset);
        offset += bytesWritten;
    }
}
