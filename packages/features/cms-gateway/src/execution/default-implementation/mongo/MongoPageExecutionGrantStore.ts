import type { Db } from "mongodb";
import { deepFreeze } from "@bernouy/cms-repository/contracts/protocol";
import type { CollectionPageExecutionGrantStore } from "../../interfaces/PageExecutionGrantStore";
import type {
    CollectionPageExecutionConsumer,
    StoredCollectionPageExecutionGrant,
} from "../../interfaces/PageExecution";

interface GrantDocument extends StoredCollectionPageExecutionGrant {
    readonly _id: string;
}

export class MongoCollectionPageExecutionGrantStore implements CollectionPageExecutionGrantStore {
    readonly #collection;

    constructor(db: Db) {
        this.#collection = db.collection<GrantDocument>("cms_collection_page_execution_grants");
    }

    async get(consumer: CollectionPageExecutionConsumer): Promise<StoredCollectionPageExecutionGrant | null> {
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
            grant.plan.consumer.collectionVersion !== consumer.collectionVersion ||
            grant.plan.consumer.collectionDigest !== consumer.collectionDigest ||
            grant.plan.consumer.pageId !== consumer.pageId ||
            grant.plan.consumer.pageGeneration !== consumer.pageGeneration ||
            !/^sha256:[0-9a-f]{64}$/u.test(grant.planDigest)
        ) {
            throw new Error("Stored collection Page execution grant is invalid");
        }
        return deepFreeze(structuredClone(grant));
    }

    async replace(grant: StoredCollectionPageExecutionGrant, expectedRevision: number): Promise<boolean> {
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

function key(consumer: CollectionPageExecutionConsumer): string {
    return JSON.stringify([
        consumer.siteId,
        consumer.publisherId,
        consumer.collectionId,
        consumer.collectionVersion,
        consumer.collectionDigest,
        consumer.pageId,
        consumer.pageGeneration,
    ]);
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && "code" in error && error.code === 11000;
}
