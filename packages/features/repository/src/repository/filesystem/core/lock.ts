import { Database, SQLiteError } from "bun:sqlite";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const WRITE_LOCK_WAIT_MS = 30 * 1_000;
const WRITE_LOCK_RETRY_MS = 10;

export type FilesystemLease = Readonly<{
    assertOwnership(): Promise<void>;
    release(): Promise<void>;
}>;

export class FilesystemLeaseBusyError extends Error {
    constructor() {
        super("Filesystem lease is already held");
        this.name = "FilesystemLeaseBusyError";
    }
}

type FilesystemLeaseOptions = Readonly<{ createParent?: boolean }>;

/** Serialize repository metadata and publication mutations across local processes. */
export async function withRepositoryWriteLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const deadline = Date.now() + WRITE_LOCK_WAIT_MS;
    let lease: FilesystemLease;
    for (;;) {
        try {
            lease = await acquireFilesystemLease(join(root, ".write-lock"));
            break;
        } catch (error) {
            if (!(error instanceof FilesystemLeaseBusyError) || Date.now() >= deadline) {
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, WRITE_LOCK_RETRY_MS));
        }
    }
    try {
        return await operation();
    } finally {
        await lease.release();
    }
}

/**
 * Hold an empty SQLite exclusive transaction, using Bun's bundled native library.
 * The kernel releases the lock on process death, including container PID reuse.
 * Keep the lock file: unlinking it would let contenders lock different inodes.
 * No business data, schema, journal or lease timestamps are written to this file.
 */
export async function acquireFilesystemLease(
    path: string,
    options: FilesystemLeaseOptions = {},
): Promise<FilesystemLease> {
    if (options.createParent !== false) {
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    }
    let database: Database;
    try {
        database = new Database(path, { create: true });
    } catch (error) {
        // Preserve ENOENT when abort/cleanup removed an upload directory before acquisition.
        await stat(dirname(path));
        throw error;
    }
    try {
        // Never block the event loop while another asynchronous operation holds the lock.
        database.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE");
        const identity = await stat(path, { bigint: true });
        let released = false;
        return Object.freeze({
            async assertOwnership() {
                const current = await stat(path, { bigint: true }).catch(() => null);
                if (
                    released ||
                    !database.inTransaction ||
                    current?.ino !== identity.ino ||
                    current.dev !== identity.dev
                ) {
                    throw new Error("Filesystem lease ownership was lost");
                }
            },
            async release() {
                if (!released) {
                    released = true;
                    database.close();
                }
            },
        });
    } catch (error) {
        database.close();
        if (error instanceof SQLiteError && error.code === "SQLITE_BUSY") {
            throw new FilesystemLeaseBusyError();
        }
        throw error;
    }
}
