import { mkdir, rmdir, stat } from "node:fs/promises";
import { dirname } from "node:path";

const RETRIES = 100;
const RETRY_MS = 20;
const STALE_MS = 30_000;

export async function withFileLock<T>(file: string, operation: () => Promise<T>): Promise<T> {
    const lock = `${file}.lock`;
    await mkdir(dirname(lock), { recursive: true });
    await acquire(lock);
    try {
        return await operation();
    } finally {
        await rmdir(lock).catch(() => undefined);
    }
}

async function acquire(lock: string): Promise<void> {
    for (let attempt = 0; attempt < RETRIES; attempt += 1) {
        try {
            await mkdir(lock);
            return;
        } catch (error) {
            if (!isExists(error)) {
                throw error;
            }
            if (await isStale(lock)) {
                await rmdir(lock).catch(() => undefined);
                continue;
            }
            await new Promise<void>((resolve) => setTimeout(resolve, RETRY_MS));
        }
    }
    throw new Error(`Timed out acquiring trigger store lock: ${lock}`);
}

async function isStale(lock: string): Promise<boolean> {
    const details = await stat(lock).catch(() => null);
    return !!details && Date.now() - details.mtimeMs > STALE_MS;
}

function isExists(error: unknown): boolean {
    return !!error && typeof error === "object" && (error as { code?: string }).code === "EEXIST";
}
