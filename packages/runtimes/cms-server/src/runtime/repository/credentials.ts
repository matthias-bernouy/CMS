import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";

const MAX_TOKEN_BYTES = 8_192;
const ERROR = "Repository management upstream token must be a bounded regular secret file";

export async function readRepositoryManagementUpstreamToken(path: string): Promise<string> {
    let handle: FileHandle;
    try {
        handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch {
        throw new Error(ERROR);
    }
    try {
        const stats = await handle.stat();
        if (!stats.isFile() || stats.size < 1 || stats.size > MAX_TOKEN_BYTES) {
            throw new Error(ERROR);
        }
        const bytes = new Uint8Array(stats.size);
        const { bytesRead } = await handle.read(bytes, 0, bytes.byteLength, 0);
        if (bytesRead !== bytes.byteLength) {
            throw new Error(ERROR);
        }
        const token = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (!token || /\s/u.test(token)) {
            throw new Error(ERROR);
        }
        return token;
    } catch {
        throw new Error(ERROR);
    } finally {
        await handle.close();
    }
}
