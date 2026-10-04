import type { Db } from "mongodb";
import { deepFreeze } from "@bernouy/cms-repository/contracts/protocol";
import type { CollectionViewExecutionGrantStore } from "../../interfaces/ViewExecutionGrantStore";
import type {
    CollectionViewExecutionConsumer,
    StoredCollectionViewExecutionGrant,
} from "../../interfaces/ViewExecution";

interface GrantDocument extends StoredCollectionViewExecutionGrant {
    readonly _id: string;
}

export class MongoCollectionViewExecutionGrantStore implements CollectionViewExecutionGrantStore {
    readonly #collection;

    constructor(db: Db) {
        this.#collection = db.collection<GrantDocument>("cms_collection_view_execution_grants");
    }

    async get(consumer: CollectionViewExecutionConsumer): Promise<StoredCollectionViewExecutionGrant | null> {
        const document = await this.#collection.findOne({ _id: key(consumer) });
        if (!document) {
            return null;
        }
        const { _id, ...grant } = document;
        if (
            !Number.isSafeInteger(grant.revision) ||
            grant.revision < 1 ||
            grant.plan.consumer.siteId !== consumer.siteId ||
            grant.plan.consumer.publisherId !== consumer.publisherId ||
            grant.plan.consumer.collectionId !== consumer.collectionId ||
            grant.plan.consumer.viewId !== consumer.viewId ||
            !/^sha256:[0-9a-f]{64}$/u.test(grant.planDigest)
        ) {
            throw new Error("Stored collection view execution grant is invalid");
        }
        return deepFreeze(structuredClone(grant));
    }

    async replace(grant: StoredCollectionViewExecutionGrant, expectedRevision: number): Promise<boolean> {
        const document = { _id: key(grant.plan.consumer), ...structuredClone(grant) };
        if (expectedRevision === 0) {
            try {
                await this.#collection.insertOne(document);
                return true;
            } catch (error) {
                if (isDuplicateKey(error)) {
                    return false;
                }
                throw error;
            }
        }
        const result = await this.#collection.replaceOne({ _id: document._id, revision: expectedRevision }, document);
        return result.matchedCount === 1;
    }
}

function key(consumer: CollectionViewExecutionConsumer): string {
    return JSON.stringify([consumer.siteId, consumer.publisherId, consumer.collectionId, consumer.viewId]);
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && "code" in error && error.code === 11000;
}
