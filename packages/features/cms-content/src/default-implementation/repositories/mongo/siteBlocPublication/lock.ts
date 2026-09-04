import { randomUUIDv7 } from "bun";
import type { Collection, Db } from "mongodb";
import {
    SiteBlocPublicationLockLostError,
    SiteBlocPublicationRecoveryRequiredError,
} from "cms-content/core/validation/errors";
import type { SiteBlocPublicationLockDoc } from "cms-content/default-implementation/repositories/mongo/documents";
import {
    LEASE_MS,
    LOCK_ID,
    MONGO_PUBLICATION_GUARDS,
    type MongoPublicationGuardState,
    RETRY_MS,
    STALE_COMMIT_MS,
    leaseExpiry,
} from "cms-content/default-implementation/repositories/mongo/siteBlocPublication/state";
import type { SiteBlocPublicationGuard } from "cms-content/interfaces/CmsRepository";

export async function withMongoSiteBlocPublicationLock<T>(
    db: Db,
    locks: Collection<SiteBlocPublicationLockDoc>,
    operation: (guard: SiteBlocPublicationGuard) => Promise<T>,
): Promise<T> {
    const token = randomUUIDv7();
    await acquire(locks, token);
    const state: MongoPublicationGuardState = { committing: false, db, locks, token };
    const guard: SiteBlocPublicationGuard = { assertHeld: () => assertHeld(state) };
    MONGO_PUBLICATION_GUARDS.set(guard, state);
    const heartbeat = setInterval(() => {
        void assertHeld(state).catch(() => {});
    }, LEASE_MS / 3);
    try {
        return await operation(guard);
    } finally {
        clearInterval(heartbeat);
        MONGO_PUBLICATION_GUARDS.delete(guard);
        await locks.deleteOne({ _id: LOCK_ID, token });
    }
}

async function assertHeld(state: MongoPublicationGuardState): Promise<void> {
    if (state.committing) {
        return;
    }
    const result = await state.locks.updateOne(
        { _id: LOCK_ID, token: state.token, phase: { $ne: "committing" } },
        { $set: { expiresAt: leaseExpiry(), phase: "leased" } },
    );
    if (result.matchedCount !== 1) {
        throw new SiteBlocPublicationLockLostError();
    }
}

async function acquire(locks: Collection<SiteBlocPublicationLockDoc>, token: string): Promise<void> {
    for (;;) {
        const current = await locks.findOne({ _id: LOCK_ID });
        const replacement: SiteBlocPublicationLockDoc = {
            _id: LOCK_ID,
            token,
            expiresAt: leaseExpiry(),
            phase: "leased",
        };
        if (!current) {
            try {
                await locks.insertOne(replacement);
                return;
            } catch (error) {
                if (!isDuplicateKey(error)) {
                    throw error;
                }
            }
        } else if (current.phase === "committing" && commitIsStale(current)) {
            throw new SiteBlocPublicationRecoveryRequiredError();
        } else if (current.phase !== "committing" && leaseExpired(current)) {
            const result = await locks.replaceOne(
                { _id: LOCK_ID, token: current.token, expiresAt: current.expiresAt },
                replacement,
            );
            if (result.matchedCount === 1) {
                return;
            }
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
}

function leaseExpired(lock: SiteBlocPublicationLockDoc): boolean {
    return !(lock.expiresAt instanceof Date) || lock.expiresAt.getTime() <= Date.now();
}

function commitIsStale(lock: SiteBlocPublicationLockDoc): boolean {
    return !(lock.committingAt instanceof Date) || lock.committingAt.getTime() + STALE_COMMIT_MS <= Date.now();
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && Reflect.get(error, "code") === 11000;
}
