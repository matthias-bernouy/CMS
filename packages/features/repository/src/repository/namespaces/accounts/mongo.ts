import type { Collection, Db } from "mongodb";
import type {
    RepositoryNamespaceLocks,
    RepositoryNamespaceOwnershipStore,
    RepositoryOwnedNamespace,
} from "./interfaces";
import { MAX_ACCOUNT_NAMESPACES } from "./validation";
import { RepositoryRequestError } from "../../core/errors";

/** Indexed, bounded metadata; runtime-injected locks are shared with account deletion and publication. */
export class MongoRepositoryNamespaces implements RepositoryNamespaceOwnershipStore {
    private readonly collection: Collection<RepositoryOwnedNamespace & { _id: string }>;

    constructor(
        db: Db,
        private readonly locks: RepositoryNamespaceLocks,
    ) {
        this.collection = db.collection("repository_namespaces");
    }

    async init(): Promise<void> {
        await this.collection.createIndex({ ownerAccountId: 1, namespace: 1 });
    }

    async get(namespace: string): Promise<RepositoryOwnedNamespace | null> {
        return this.collection.findOne({ _id: namespace }, { projection: { _id: 0 } });
    }

    async listOwned(accountId: string): Promise<readonly RepositoryOwnedNamespace[]> {
        const records = await this.collection
            .find({ ownerAccountId: accountId }, { projection: { _id: 0 } })
            .sort({ namespace: 1 })
            .limit(MAX_ACCOUNT_NAMESPACES + 1)
            .toArray();
        if (records.length > MAX_ACCOUNT_NAMESPACES) {
            throw new Error("Persisted namespace count exceeds the account limit");
        }
        return records;
    }

    countOwned(accountId: string, maximum: number): Promise<number> {
        return this.collection.countDocuments({ ownerAccountId: accountId }, { limit: maximum });
    }

    exclusiveOwners<T>(operation: () => Promise<T>): Promise<T> {
        return this.locks.exclusive("owners", operation);
    }

    exclusive<T>(
        namespace: string,
        operation: (
            current: RepositoryOwnedNamespace | null,
            save: (next: RepositoryOwnedNamespace) => Promise<void>,
        ) => Promise<T>,
    ): Promise<T> {
        return this.locks.exclusive(`namespace:${namespace}`, async () => {
            let current = await this.get(namespace);
            return operation(current, async (next) => {
                if (next.namespace !== namespace || next.revision !== (current?.revision ?? 0) + 1) {
                    throw new Error("Invalid namespace ownership transition");
                }
                const result = await this.collection.updateOne(
                    {
                        _id: namespace,
                        ...(current ? { revision: current.revision } : { revision: { $exists: false } }),
                    },
                    { $set: next },
                    { upsert: !current },
                );
                if (!result.matchedCount && !result.upsertedCount) {
                    throw new RepositoryRequestError("REJECTED", "Namespace ownership changed");
                }
                current = { ...next };
            });
        });
    }
}
