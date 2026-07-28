import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const MAX_MANAGEMENT_TOKEN_BYTES = 8_192;
const TOKEN_FILE_ERROR =
    "Repository management token file must be an absolute, non-empty regular file of at most 8192 bytes";

export async function readRepositoryManagementTokenFile(path: string): Promise<string> {
    if (!isAbsolute(path)) {
        throw new Error(TOKEN_FILE_ERROR);
    }

    let handle: FileHandle;
    try {
        handle = await open(resolve(path), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch {
        throw new Error(TOKEN_FILE_ERROR);
    }

    try {
        const stats = await handle.stat();
        if (!stats.isFile() || stats.size < 1 || stats.size > MAX_MANAGEMENT_TOKEN_BYTES) {
            throw new Error(TOKEN_FILE_ERROR);
        }
        const bytes = await readBounded(handle);
        const token = decodeUtf8(bytes);
        if (!token || /\s/u.test(token)) {
            throw new Error("Repository management token must be non-empty and contain no whitespace");
        }
        return token;
    } finally {
        await handle.close();
    }
}

async function readBounded(handle: FileHandle): Promise<Uint8Array> {
    const buffer = Buffer.alloc(MAX_MANAGEMENT_TOKEN_BYTES + 1);
    let offset = 0;
    while (offset < buffer.byteLength) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.byteLength - offset, null);
        if (bytesRead === 0) {
            break;
        }
        offset += bytesRead;
    }
    if (offset < 1 || offset > MAX_MANAGEMENT_TOKEN_BYTES) {
        throw new Error(TOKEN_FILE_ERROR);
    }
    return buffer.subarray(0, offset);
}

function decodeUtf8(bytes: Uint8Array): string {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        throw new Error("Repository management token file must contain valid UTF-8");
    }
}
