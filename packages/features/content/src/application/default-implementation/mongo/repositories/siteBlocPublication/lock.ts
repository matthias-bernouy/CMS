import { randomUUIDv7 } from "bun";
import { AsyncLocalStorage } from "node:async_hooks";
import { ContentConflictError } from "content/application/core/validation/errors";
import type { Collection, Db } from "mongodb";
import {
    SiteBlocPublicationLockLostError,
    SiteBlocPublicationRecoveryRequiredError,
} from "content/application/core/validation/errors";
import type { SiteBlocPublicationLockDoc } from "content/application/default-implementation/mongo/repositories/documents";
import {
    LEASE_MS,
    LOCK_ID,
    MONGO_PUBLICATION_GUARDS,
    type MongoPublicationGuardState,
    RETRY_MS,
    STALE_COMMIT_MS,
    leaseExpiry,
    samePublicationScope,
} from "content/application/default-implementation/mongo/repositories/siteBlocPublication/state";
import type { SiteBlocPublicationGuard } from "content/application/interfaces/ContentRepository";

const holders = new AsyncLocalStorage<readonly { db: Db; locks: Collection<SiteBlocPublicationLockDoc> }[]>();

export async function withMongoSiteBlocPublicationLock<T>(
    db: Db,
    locks: Collection<SiteBlocPublicationLockDoc>,
    operation: (guard: SiteBlocPublicationGuard) => Promise<T>,
): Promise<T> {
    const parents = holders.getStore() ?? [];
    if (parents.some((holder) => samePublicationScope(holder, { db, locks }))) {
        throw new ContentConflictError("Nested content reference/publication operations are not supported");
    }
    const token = randomUUIDv7();
    await acquire(locks, token);
    const state: MongoPublicationGuardState = { committing: false, db, locks, token };
    const guard: SiteBlocPublicationGuard = { assertHeld: () => assertHeld(state) };
    MONGO_PUBLICATION_GUARDS.set(guard, state);
    const heartbeat = setInterval(() => {
        void assertHeld(state).catch(() => {});
    }, LEASE_MS / 3);
    try {
        return await holders.run([...parents, { db, locks }], () => operation(guard));
    } finally {
        clearInterval(heartbeat);
        MONGO_PUBLICATION_GUARDS.delete(guard);
        if (!state.retainFence) {
            await locks.deleteOne({ _id: LOCK_ID, token });
        }
    }
}

async function assertHeld(state: MongoPublicationGuardState): Promise<void> {
    if (state.lost) {
        throw new SiteBlocPublicationLockLostError();
    }
    if (state.enteringCommit) {
        await state.enteringCommit;
    }
    if (state.committing) {
        // Transactional publication keeps the persisted lease phase until commit.
        if (!(await state.locks.findOne({ _id: LOCK_ID, token: state.token }))) {
            state.lost = true;
            throw new SiteBlocPublicationLockLostError();
        }
        return;
    }
    const result = await state.locks.updateOne(
        { _id: LOCK_ID, token: state.token, phase: { $ne: "committing" } },
        { $set: { expiresAt: leaseExpiry(), phase: "leased" } },
    );
    if (result.matchedCount !== 1) {
        state.lost = true;
        throw new SiteBlocPublicationLockLostError();
    }
}

async function acquire(locks: Collection<SiteBlocPublicationLockDoc>, token: string): Promise<void> {
    const deadline = Date.now() + 5000;
    let delay = RETRY_MS;
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
        if (Date.now() >= deadline) {
            throw new SiteBlocPublicationLockLostError();
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(delay, deadline - Date.now())));
        delay = Math.min(delay * 2, 250);
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
