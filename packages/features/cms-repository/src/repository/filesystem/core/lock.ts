import { randomUUID } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { syncDirectory } from "./durable";

const LEASE_SCHEMA = "ulvia.filesystem-lease.v1";
const STALE_AFTER_MS = 10 * 60 * 1_000;
const HEARTBEAT_MS = 60 * 1_000;

type LeaseDocument = Readonly<{
    schema: typeof LEASE_SCHEMA;
    owner: string;
    pid: number;
    acquiredAt: string;
}>;

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
    const lease = await acquireFilesystemLease(join(root, ".write-lock"));
    try {
        return await operation();
    } finally {
        await lease.release();
    }
}

/** Acquire a renewable, owner-checked lease on one filesystem path. */
export async function acquireFilesystemLease(
    path: string,
    options: FilesystemLeaseOptions = {},
): Promise<FilesystemLease> {
    if (options.createParent !== false) {
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    }
    const owner = randomUUID();
    const handle = await acquire(path, owner);
    let released = false;
    const heartbeat = setInterval(() => void renew(path, owner, handle), HEARTBEAT_MS);
    heartbeat.unref();
    return Object.freeze({
        async assertOwnership() {
            if (released || (await readLease(path))?.owner !== owner) {
                throw new Error("Filesystem lease ownership was lost");
            }
        },
        async release() {
            if (released) {
                return;
            }
            released = true;
            clearInterval(heartbeat);
            await handle.close();
            if ((await readLease(path))?.owner === owner) {
                await rm(path, { force: true });
                await syncDirectory(dirname(path));
            }
        },
    });
}

async function acquire(path: string, owner: string): Promise<FileHandle> {
    for (let attempt = 0; attempt < 4; attempt++) {
        let handle: FileHandle;
        try {
            handle = await open(path, "wx", 0o600);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                throw error;
            }
            if (!(await recoverStale(path))) {
                throw new FilesystemLeaseBusyError();
            }
            continue;
        }
        try {
            const document: LeaseDocument = {
                schema: LEASE_SCHEMA,
                owner,
                pid: process.pid,
                acquiredAt: new Date().toISOString(),
            };
            await handle.writeFile(JSON.stringify(document));
            await handle.sync();
            await syncDirectory(dirname(path));
            return handle;
        } catch (error) {
            await handle.close().catch(() => undefined);
            await rm(path, { force: true }).catch(() => undefined);
            throw error;
        }
    }
    throw new FilesystemLeaseBusyError();
}

async function recoverStale(path: string): Promise<boolean> {
    const metadata = await stat(path).catch(() => null);
    if (!metadata) {
        return true;
    }
    if (Date.now() - metadata.mtimeMs <= STALE_AFTER_MS) {
        return false;
    }
    const lease = await readLease(path);
    if (lease && processIsAlive(lease.pid)) {
        return false;
    }
    const stale = `${path}.${randomUUID()}.stale`;
    try {
        await rename(path, stale);
        await rm(stale, { force: true });
        await syncDirectory(dirname(path));
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return true;
        }
        throw error;
    }
}

async function renew(path: string, owner: string, handle: FileHandle): Promise<void> {
    if ((await readLease(path))?.owner !== owner) {
        return;
    }
    const now = new Date();
    await handle.utimes(now, now).catch(() => undefined);
}

async function readLease(path: string): Promise<LeaseDocument | null> {
    const value = await readFile(path, "utf8").catch(() => null);
    if (value === null) {
        return null;
    }
    try {
        const document = JSON.parse(value) as Partial<LeaseDocument>;
        return document.schema === LEASE_SCHEMA &&
            typeof document.owner === "string" &&
            Number.isSafeInteger(document.pid) &&
            (document.pid as number) > 0 &&
            typeof document.acquiredAt === "string"
            ? (document as LeaseDocument)
            : null;
    } catch {
        return null;
    }
}

function processIsAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === "EPERM";
    }
}
