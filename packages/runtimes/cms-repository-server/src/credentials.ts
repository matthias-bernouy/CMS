import { lstat, readFile } from "node:fs/promises";

const MAX_MANAGEMENT_TOKEN_BYTES = 8_192;

export async function readRepositoryManagementToken(path: string): Promise<string> {
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isFile() || stats.size > MAX_MANAGEMENT_TOKEN_BYTES) {
        throw new Error("Repository management token file must be a bounded regular file");
    }
    const token = (await readFile(path, "utf8")).trim();
    if (!token || /\s/.test(token)) {
        throw new Error("Repository management token file must contain one non-empty Bearer token");
    }
    return token;
}
