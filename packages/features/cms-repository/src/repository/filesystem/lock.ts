import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

const STALE_AFTER_MS = 10 * 60 * 1_000;

/** Serialize repository metadata and publication mutations across CLI processes. */
export async function withRepositoryWriteLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const path = join(root, ".write-lock");
    const owner = randomUUID();
    const handle = await acquire(path, owner);
    try {
        return await operation();
    } finally {
        await handle.close();
        const current = await readFile(path, "utf8").catch(() => null);
        if (current === owner) {
            await rm(path, { force: true });
        }
    }
}

export async function pruneRepository(root: string): Promise<void> {
    await withRepositoryWriteLock(root, async () => {
        const metadata = await lstat(root);
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
            throw new Error("Local repository root must be a real directory");
        }
        for (const name of await readdir(root)) {
            if (name === ".write-lock") {
                continue;
            }
            const path = join(root, name);
            await makeDirectoryTreeRemovable(path);
            await rm(path, { recursive: true, force: true });
        }
    });
}

async function acquire(path: string, owner: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const handle = await open(path, "wx", 0o600);
            await handle.writeFile(owner);
            return handle;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                throw error;
            }
            const metadata = await stat(path).catch(() => null);
            if (!metadata || Date.now() - metadata.mtimeMs <= STALE_AFTER_MS || attempt > 0) {
                throw new Error("Repository write already in progress");
            }
            const stale = `${path}.${randomUUID()}.stale`;
            await rename(path, stale).catch((renameError: NodeJS.ErrnoException) => {
                if (renameError.code !== "ENOENT") {
                    throw renameError;
                }
            });
            await rm(stale, { force: true });
        }
    }
    throw new Error("Repository write already in progress");
}

async function makeDirectoryTreeRemovable(path: string): Promise<void> {
    const entry = await lstat(path);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
        return;
    }
    await chmod(path, entry.mode | 0o700);
    for (const name of await readdir(path)) {
        await makeDirectoryTreeRemovable(join(path, name));
    }
}
