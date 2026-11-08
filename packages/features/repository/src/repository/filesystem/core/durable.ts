import { mkdir, open, rename } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

type DurableWriteOptions = Readonly<{
    flag?: "w" | "wx";
    mode?: number;
}>;

/** Create a directory tree and flush every created relationship up to a trusted boundary. */
export async function ensureDurableDirectory(path: string, boundary: string): Promise<void> {
    const resolvedPath = resolve(path);
    const resolvedBoundary = resolve(boundary);
    const fromBoundary = relative(resolvedBoundary, resolvedPath);
    if (fromBoundary.startsWith("..") || fromBoundary === "..") {
        throw new Error("Durable directory must remain inside its boundary");
    }
    await mkdir(resolvedPath, { recursive: true, mode: 0o700 });
    let current = resolvedPath;
    for (;;) {
        await syncDirectory(current);
        if (current === resolvedBoundary) {
            return;
        }
        current = dirname(current);
    }
}

/** Write and flush bytes before exposing their directory entry. */
export async function durableWriteFile(
    path: string,
    bytes: string | Uint8Array,
    options: DurableWriteOptions = {},
): Promise<void> {
    const handle = await open(path, options.flag ?? "w", options.mode ?? 0o600);
    try {
        await handle.writeFile(bytes);
        await handle.sync();
    } finally {
        await handle.close();
    }
}

/** Atomically replace a path, then flush the containing directory entry. */
export async function durableRename(source: string, destination: string): Promise<void> {
    await rename(source, destination);
    await syncDirectory(dirname(destination));
}

/** Flush a directory after a hard link or removal changed its entries. */
export async function syncDirectory(path: string): Promise<void> {
    const handle = await open(path, "r");
    try {
        await handle.sync();
    } catch (error) {
        if (!unsupportedDirectorySync(error)) {
            throw error;
        }
    } finally {
        await handle.close();
    }
}

function unsupportedDirectorySync(error: unknown): boolean {
    return ["EINVAL", "ENOTSUP", "EISDIR"].includes((error as NodeJS.ErrnoException).code ?? "");
}
