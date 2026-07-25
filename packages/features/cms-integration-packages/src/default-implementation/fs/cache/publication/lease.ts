import { constants, type Stats } from "node:fs";
import { lstat, open } from "node:fs/promises";

type RepairLockLeaseOptions = {
    repairLockStaleAgeMs: number;
    now(): number;
};

export type RepairLockLease = {
    assertOwned(): Promise<void>;
    stop(): Promise<void>;
};

export function startRepairLockLease(lock: string, ownership: Stats, options: RepairLockLeaseOptions): RepairLockLease {
    let failure: unknown;
    let pending = Promise.resolve();
    const refresh = (): void => {
        pending = pending
            .then(async () => {
                if (failure === undefined) {
                    await refreshRepairLock(lock, ownership, options.now());
                }
            })
            .catch((error: unknown) => {
                failure = error;
            });
    };
    const interval = Math.max(1, Math.floor(options.repairLockStaleAgeMs / 3));
    const timer = setInterval(refresh, interval);
    return {
        async assertOwned(): Promise<void> {
            refresh();
            await pending;
            if (failure !== undefined) {
                throw failure;
            }
        },
        async stop(): Promise<void> {
            clearInterval(timer);
            await pending;
        },
    };
}

export function sameEntry(left: Stats, right: Stats): boolean {
    return left.dev === right.dev && left.ino === right.ino;
}

async function refreshRepairLock(lock: string, ownership: Stats, now: number): Promise<void> {
    const handle = await open(lock, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
        const current = await handle.stat();
        assertSameEntry(ownership, current);
        const timestamp = new Date(now);
        await handle.utimes(timestamp, timestamp);
        await handle.sync();
        assertSameEntry(ownership, await lstat(lock));
    } finally {
        await handle.close();
    }
}

function assertSameEntry(expected: Stats, actual: Stats): void {
    if (!sameEntry(expected, actual)) {
        throw new Error("Integration package cache repair lock ownership was lost");
    }
}
