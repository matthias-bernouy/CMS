import { constants } from "node:fs";
import { open } from "node:fs/promises";

const MAX_MANAGEMENT_TOKEN_BYTES = 8_192;
const TOKEN_FILE_ERROR = "Repository management token file must be a bounded regular file";
const TOKEN_CONTENT_ERROR = "Repository management token file must contain one non-empty Bearer token";
const utf8 = new TextDecoder("utf-8", { fatal: true });

export async function readRepositoryManagementToken(path: string): Promise<string> {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
        handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        const stats = await handle.stat();
        if (!stats.isFile() || stats.size > MAX_MANAGEMENT_TOKEN_BYTES) {
            throw new RepositoryManagementTokenFileError(TOKEN_FILE_ERROR);
        }
        const bytes = new Uint8Array(MAX_MANAGEMENT_TOKEN_BYTES + 1);
        let length = 0;
        while (length < bytes.byteLength) {
            const result = await handle.read(bytes, length, bytes.byteLength - length, length);
            if (result.bytesRead === 0) {
                break;
            }
            length += result.bytesRead;
        }
        if (length > MAX_MANAGEMENT_TOKEN_BYTES) {
            throw new RepositoryManagementTokenFileError(TOKEN_FILE_ERROR);
        }
        const token = utf8.decode(bytes.subarray(0, length)).trim();
        if (!token || /\s/u.test(token)) {
            throw new RepositoryManagementTokenFileError(TOKEN_CONTENT_ERROR);
        }
        return token;
    } catch (error) {
        if (error instanceof RepositoryManagementTokenFileError) {
            throw error;
        }
        throw new RepositoryManagementTokenFileError(TOKEN_FILE_ERROR);
    } finally {
        await handle?.close();
    }
}

class RepositoryManagementTokenFileError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RepositoryManagementTokenFileError";
    }
}
