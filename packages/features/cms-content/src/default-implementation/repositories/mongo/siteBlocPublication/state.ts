import type { Collection } from "mongodb";
import type { SiteBlocPublicationLockDoc } from "cms-content/default-implementation/repositories/mongo/documents";
import type { SiteBlocPublicationGuard } from "cms-content/interfaces/CmsRepository";

export const LOCK_ID = "published-graph";
export const LEASE_MS = 30_000;
export const RETRY_MS = 20;
export const STALE_COMMIT_MS = 60_000;

export type MongoPublicationGuardState = {
    committing: boolean;
    locks: Collection<SiteBlocPublicationLockDoc>;
    token: string;
};

export const MONGO_PUBLICATION_GUARDS = new WeakMap<SiteBlocPublicationGuard, MongoPublicationGuardState>();

export function leaseExpiry(): Date {
    return new Date(Date.now() + LEASE_MS);
}
