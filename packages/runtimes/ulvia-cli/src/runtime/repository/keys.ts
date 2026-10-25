import { constants } from "node:fs";
import { open } from "node:fs/promises";

export async function readNamespacePrivateKey(path: string): Promise<string> {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const metadata = await handle.stat();
        if (!metadata.isFile() || metadata.size > 4_096 || (metadata.mode & 0o077) !== 0) {
            throw new Error("Namespace private key must be a private regular file of at most 4096 bytes");
        }
        return await handle.readFile("utf8");
    } finally {
        await handle.close();
    }
}
