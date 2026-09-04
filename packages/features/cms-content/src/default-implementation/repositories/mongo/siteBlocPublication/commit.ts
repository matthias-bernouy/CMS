import type { ClientSession, Db } from "mongodb";
import { SiteBlocPublicationLockLostError } from "cms-content/core/validation/errors";
import {
    LOCK_ID,
    MONGO_PUBLICATION_GUARDS,
    type MongoPublicationGuardState,
    leaseExpiry,
} from "cms-content/default-implementation/repositories/mongo/siteBlocPublication/state";
import type { SiteBlocPublicationGuard } from "cms-content/interfaces/CmsRepository";

export async function commitMongoSiteBlocPublication<T>(
    db: Db,
    guard: SiteBlocPublicationGuard,
    operation: (session?: ClientSession) => Promise<T>,
): Promise<T> {
    const state = MONGO_PUBLICATION_GUARDS.get(guard);
    if (!state || state.db !== db || state.committing) {
        throw new SiteBlocPublicationLockLostError();
    }
    state.committing = true;
    let persistenceStarted = false;
    try {
        try {
            return await commitInTransaction(db, state, async (session) => {
                persistenceStarted = true;
                return operation(session);
            });
        } catch (error) {
            if (persistenceStarted || !isTransactionUnavailable(error)) {
                throw error;
            }
            return await commitOnStandalone(state, operation);
        }
    } finally {
        state.committing = false;
    }
}

async function commitInTransaction<T>(
    db: Db,
    state: MongoPublicationGuardState,
    operation: (session: ClientSession) => Promise<T>,
): Promise<T> {
    const session = db.client.startSession();
    try {
        return await session.withTransaction(
            async () => {
                const renewed = await state.locks.updateOne(
                    { _id: LOCK_ID, token: state.token, phase: { $ne: "committing" } },
                    { $set: { expiresAt: leaseExpiry(), phase: "leased" } },
                    { session },
                );
                if (renewed.matchedCount !== 1) {
                    throw new SiteBlocPublicationLockLostError();
                }
                return operation(session);
            },
            { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
        );
    } finally {
        await session.endSession();
    }
}

async function commitOnStandalone<T>(
    state: MongoPublicationGuardState,
    operation: (session?: ClientSession) => Promise<T>,
): Promise<T> {
    const fenced = await state.locks.updateOne(
        { _id: LOCK_ID, token: state.token, phase: { $ne: "committing" } },
        { $set: { committingAt: new Date(), expiresAt: leaseExpiry(), phase: "committing" } },
    );
    if (fenced.matchedCount !== 1) {
        throw new SiteBlocPublicationLockLostError();
    }
    return operation();
}

function isTransactionUnavailable(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }
    return (
        Reflect.get(error, "code") === 20 ||
        Reflect.get(error, "codeName") === "IllegalOperation" ||
        (error instanceof Error &&
            (error.message.includes("Transaction numbers are only allowed") ||
                error.message.includes("does not support retryable writes")))
    );
}
