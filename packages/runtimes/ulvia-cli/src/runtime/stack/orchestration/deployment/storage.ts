import { constants } from "node:fs";
import { open, rename, rm, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export async function atomicPrivateWrite(path: string, text: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
        const handle = await open(temporary, "wx", 0o600);
        try {
            await handle.writeFile(text);
            await handle.sync();
        } finally {
            await handle.close();
        }
        await rename(temporary, path);
        const directory = await open(dirname(path), "r");
        try {
            await directory.sync();
        } finally {
            await directory.close();
        }
    } finally {
        await rm(temporary, { force: true });
    }
}

export async function readPrivateFile(path: string, max = 1024 * 1024): Promise<string | null> {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (!handle) {
        return null;
    }
    try {
        const metadata = await handle.stat();
        if (!metadata.isFile() || metadata.size > max || (metadata.mode & 0o077) !== 0) {
            throw new Error("Invalid private deployment file");
        }
        const bytes = Buffer.alloc(max + 1);
        const { bytesRead } = await handle.read(bytes);
        if (bytesRead > max) {
            throw new Error("Deployment file exceeds its byte bound");
        }
        return bytes.subarray(0, bytesRead).toString();
    } finally {
        await handle.close();
    }
}
