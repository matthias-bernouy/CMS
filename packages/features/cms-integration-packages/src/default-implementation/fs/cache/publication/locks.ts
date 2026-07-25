import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, mkdir, rename, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { isMissing, type IntegrationPackageCacheLayout } from "../paths";
import { syncDirectory } from "../writing";
import { sameEntry, startRepairLockLease } from "./lease";
import type { PublishStagedPackageOptions } from "./types";

export async function withRepairLock<T>(
    options: PublishStagedPackageOptions,
    operation: (assertOwned: () => Promise<void>) => Promise<T>,
): Promise<T> {
    const lock = join(options.layout.locks, options.digest);
    const deadline = options.now() + options.repairLockWaitMs;
    let ownership: Stats;
    while (true) {
        try {
            await mkdir(lock, { mode: 0o700 });
            ownership = await lstat(lock);
            break;
        } catch (error) {
            if (!isExisting(error)) {
                throw error;
            }
            if (await recoverExpiredRepairLock(options, lock)) {
                continue;
            }
            if (options.now() >= deadline) {
                throw new Error(`Timed out waiting for integration package cache repair lock ${options.digest}`);
            }
            await delay(10);
        }
    }
    const lease = startRepairLockLease(lock, ownership, options);
    try {
        await syncDirectory(options.layout.locks);
        return await operation(lease.assertOwned);
    } finally {
        await lease.stop();
        await releaseRepairLock(options.layout, lock, ownership);
    }
}

async function releaseRepairLock(layout: IntegrationPackageCacheLayout, lock: string, ownership: Stats): Promise<void> {
    try {
        const current = await lstat(lock);
        if (!sameEntry(current, ownership)) {
            return;
        }
        await rmdir(lock);
        await syncDirectory(layout.locks);
    } catch (error) {
        if (!isMissing(error)) {
            throw error;
        }
    }
}

async function recoverExpiredRepairLock(options: PublishStagedPackageOptions, lock: string): Promise<boolean> {
    let metadata;
    try {
        metadata = await lstat(lock);
    } catch (error) {
        if (isMissing(error)) {
            return true;
        }
        throw error;
    }
    if (options.now() - metadata.mtimeMs < options.repairLockStaleAgeMs) {
        return false;
    }
    const current = await lstat(lock).catch((error: unknown) => {
        if (isMissing(error)) {
            return null;
        }
        throw error;
    });
    if (!current) {
        return true;
    }
    if (!sameEntry(metadata, current) || options.now() - current.mtimeMs < options.repairLockStaleAgeMs) {
        return false;
    }
    const destination = join(options.layout.corrupt, `repair-lock-${options.digest}-${randomUUID()}`);
    try {
        await rename(lock, destination);
        const moved = await lstat(destination);
        if (!sameEntry(current, moved)) {
            throw new Error("Integration package cache repair lock generation changed during recovery");
        }
        await Promise.all([syncDirectory(options.layout.locks), syncDirectory(options.layout.corrupt)]);
        return true;
    } catch (error) {
        if (isMissing(error)) {
            return true;
        }
        throw error;
    }
}

function isExisting(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
