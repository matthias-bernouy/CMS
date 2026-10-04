import { mkdir, open, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { RepositoryReplayStore } from "cms-repository/repository/publication/types";
import { withRepositoryWriteLock } from "../lock";

/** Durable replay claims shared by every process using the same repository root. */
export class FilesystemRepositoryReplayStore implements RepositoryReplayStore {
    constructor(private readonly root: string) {}

    async claim(signature: string, expiresAt: Date): Promise<boolean> {
        const key = signatureKey(signature);
        return withRepositoryWriteLock(this.root, async () => {
            const directory = join(this.root, ".publication-replays");
            await mkdir(directory, { recursive: true, mode: 0o700 });
            await prune(directory);
            const path = join(directory, key);
            const existing = await readExpiry(path);
            if (existing !== null && existing > Date.now()) {
                return false;
            }
            await rm(path, { force: true });
            const handle = await open(path, "wx", 0o600);
            try {
                await handle.writeFile(String(expiresAt.getTime()));
            } finally {
                await handle.close();
            }
            return true;
        });
    }
}

function signatureKey(signature: string): string {
    const match = /^sha256=([0-9a-f]{64})$/u.exec(signature);
    if (!match) {
        throw new Error("Invalid repository replay signature");
    }
    return match[1]!;
}

async function prune(directory: string): Promise<void> {
    const now = Date.now();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !/^[0-9a-f]{64}$/u.test(entry.name)) {
            continue;
        }
        const path = join(directory, entry.name);
        const expiry = await readExpiry(path);
        if (expiry !== null && expiry <= now) {
            await rm(path, { force: true });
        }
    }
}

async function readExpiry(path: string): Promise<number | null> {
    const value = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (value === null) {
        return null;
    }
    const expiry = Number(value);
    if (!Number.isSafeInteger(expiry) || expiry <= 0) {
        throw new Error("Invalid repository replay record");
    }
    return expiry;
}
