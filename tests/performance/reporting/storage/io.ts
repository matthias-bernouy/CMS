import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/** Exclusive, flushed evidence must exist before the next measured environment is acquired. */
export async function exclusiveJson(path: string, value: unknown) {
    const bytes = `${JSON.stringify(value)}\n`;
    if (Buffer.byteLength(bytes) > 32 * 1024 * 1024) {
        throw new Error("Performance evidence exceeds its byte limit");
    }
    const file = await open(path, "wx", 0o600);
    try {
        await file.writeFile(bytes);
        await file.sync();
    } finally {
        await file.close();
    }
    return bytes;
}

export async function realDirectory(path: string): Promise<void> {
    const metadata = await lstat(path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error("Performance history must use real directories");
    }
    const parent = dirname(resolve(path));
    if (parent !== resolve(path)) {
        await realDirectory(parent);
    }
}

export async function regularBytes(path: string, maximum: number): Promise<Buffer> {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(() => {
        throw new Error("Performance artifact is not a bounded regular file");
    });
    try {
        const metadata = await file.stat();
        if (!metadata.isFile() || metadata.size > maximum) {
            throw new Error("Performance artifact is not a bounded regular file");
        }
        const bytes = Buffer.alloc(metadata.size + 1);
        const result = await file.read(bytes, 0, bytes.length, 0);
        if (result.bytesRead !== metadata.size) {
            throw new Error("Performance artifact changed while reading");
        }
        return bytes.subarray(0, result.bytesRead);
    } finally {
        await file.close();
    }
}
