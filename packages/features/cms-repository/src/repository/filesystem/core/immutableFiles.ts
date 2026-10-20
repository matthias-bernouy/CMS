import { randomUUID } from "node:crypto";
import { link, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { durableWriteFile, syncDirectory } from "./durable";

export async function writeImmutableFile(
    path: string,
    bytes: Uint8Array | Blob,
    conflictMessage: string,
): Promise<void> {
    const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
    const snapshot = bytes instanceof Blob ? new Uint8Array(await bytes.arrayBuffer()) : bytes.slice();
    await durableWriteFile(temporary, snapshot, { flag: "wx", mode: 0o600 });
    try {
        await link(temporary, path);
        await syncDirectory(dirname(path));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw error;
        }
        const winner = await readFile(path);
        if (!winner.equals(snapshot)) {
            throw new Error(conflictMessage);
        }
    } finally {
        await rm(temporary, { force: true });
    }
}

export async function listDirectories(root: string): Promise<string[]> {
    const entries = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    });
    return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
}
