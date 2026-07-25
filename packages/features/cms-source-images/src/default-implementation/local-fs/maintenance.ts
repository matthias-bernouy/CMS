import { lstat, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

export async function directoryFileNames(directory: string): Promise<string[]> {
    try {
        const entries = await readdir(directory, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isFile() || entry.isSymbolicLink())
            .map((entry) => entry.name)
            .sort();
    } catch {
        return [];
    }
}

export async function removeTemporaryFiles(directory: string, names: readonly string[]): Promise<void> {
    await Promise.all(names.filter((name) => name.endsWith(".tmp")).map((name) => removeFile(join(directory, name))));
}

export async function regularFileSize(path: string): Promise<number | null> {
    try {
        const details = await lstat(path);
        return details.isFile() ? details.size : null;
    } catch {
        return null;
    }
}

export async function removeFile(path: string): Promise<void> {
    await unlink(path).catch(() => undefined);
}
