import type { Collection, Db } from "mongodb";
import type { SiteBlocPublicationLockDoc } from "content/application/default-implementation/mongo/repositories/documents";
import type { SiteBlocPublicationGuard } from "content/application/interfaces/ContentRepository";

export const LOCK_ID = "published-graph";
export const LEASE_MS = 30_000;
export const RETRY_MS = 20;
export const STALE_COMMIT_MS = 60_000;

export type MongoPublicationGuardState = {
    committing: boolean;
    lost?: boolean;
    enteringCommit?: Promise<void>;
    retainFence?: boolean;
    db: Db;
    locks: Collection<SiteBlocPublicationLockDoc>;
    token: string;
};

export const MONGO_PUBLICATION_GUARDS = new WeakMap<SiteBlocPublicationGuard, MongoPublicationGuardState>();

export function leaseExpiry(): Date {
    return new Date(Date.now() + LEASE_MS);
}

export function samePublicationScope(
    first: { db: Db; locks: Collection<SiteBlocPublicationLockDoc> },
    second: { db: Db; locks: Collection<SiteBlocPublicationLockDoc> },
): boolean {
    return (
        (first.db === second.db && first.locks === second.locks) ||
        (first.db.client === second.db.client &&
            typeof first.locks.namespace === "string" &&
            first.locks.namespace === second.locks.namespace)
    );
}
