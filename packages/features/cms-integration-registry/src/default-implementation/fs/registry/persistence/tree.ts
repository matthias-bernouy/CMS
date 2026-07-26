import { chmod, lstat, opendir, rm } from "node:fs/promises";
import { join } from "node:path";

export async function removeImmutableTreeIfExists(path: string): Promise<void> {
    try {
        await makeWritable(path);
        await rm(path, { recursive: true });
    } catch (error) {
        if (!isNodeError(error) || error.code !== "ENOENT") {
            throw error;
        }
    }
}

async function makeWritable(path: string): Promise<void> {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) {
        throw new Error(`Refusing to clean a symlinked integration registry tree: ${path}`);
    }
    if (!metadata.isDirectory()) {
        return;
    }
    await chmod(path, 0o750);
    const handle = await opendir(path);
    for await (const entry of handle) {
        if (entry.isDirectory()) {
            await makeWritable(join(path, entry.name));
        } else if (entry.isSymbolicLink()) {
            throw new Error(`Refusing to clean a symlinked integration registry entry: ${join(path, entry.name)}`);
        }
    }
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
