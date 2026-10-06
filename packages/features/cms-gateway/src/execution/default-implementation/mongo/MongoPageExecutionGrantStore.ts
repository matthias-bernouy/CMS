import type { Db } from "mongodb";
import { deepFreeze } from "@bernouy/cms-repository/contracts/protocol";
import type { PageExecutionGrantStore } from "../../interfaces/PageExecutionGrantStore";
import type { PageExecutionConsumer, StoredPageExecutionGrant } from "../../interfaces/PageExecution";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";

interface GrantDocument extends StoredPageExecutionGrant {
    readonly _id: string;
}

export class MongoPageExecutionGrantStore implements PageExecutionGrantStore {
    readonly #collection;

    constructor(db: Db) {
        this.#collection = db.collection<GrantDocument>("cms_page_execution_grants");
    }

    async get(consumer: PageExecutionConsumer): Promise<StoredPageExecutionGrant | null> {
        const document = await this.#collection.findOne({ _id: key(consumer) });
        if (!document) {
            return null;
        }
        const { _id, ...grant } = document;
        if (
            !Number.isSafeInteger(grant.revision) ||
            grant.revision < 1 ||
            canonicalizeIJson(grant.plan.consumer) !== canonicalizeIJson(consumer) ||
            !/^sha256:[0-9a-f]{64}$/u.test(grant.planDigest)
        ) {
            throw new Error("Stored Page execution grant is invalid");
        }
        return deepFreeze(structuredClone(grant));
    }

    async replace(grant: StoredPageExecutionGrant, expectedRevision: number): Promise<boolean> {
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

function key(consumer: PageExecutionConsumer): string {
    return consumer.kind === "site"
        ? JSON.stringify(["site", consumer.siteId, consumer.pageId, consumer.pageRevision])
        : JSON.stringify([
              "collection",
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
