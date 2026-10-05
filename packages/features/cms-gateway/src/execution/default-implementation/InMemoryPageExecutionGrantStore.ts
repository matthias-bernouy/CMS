import { deepFreeze } from "@bernouy/cms-repository/contracts/protocol";
import type { CollectionPageExecutionGrantStore } from "../interfaces/PageExecutionGrantStore";
import type { CollectionPageExecutionConsumer, StoredCollectionPageExecutionGrant } from "../interfaces/PageExecution";

export class InMemoryCollectionPageExecutionGrantStore implements CollectionPageExecutionGrantStore {
    readonly #records = new Map<string, StoredCollectionPageExecutionGrant>();

    async get(consumer: CollectionPageExecutionConsumer): Promise<StoredCollectionPageExecutionGrant | null> {
        const record = this.#records.get(key(consumer));
        return record ? deepFreeze(structuredClone(record)) : null;
    }

    async replace(grant: StoredCollectionPageExecutionGrant, expectedRevision: number): Promise<boolean> {
        const id = key(grant.plan.consumer);
        if ((this.#records.get(id)?.revision ?? 0) !== expectedRevision || grant.revision !== expectedRevision + 1) {
            return false;
        }
        this.#records.set(id, deepFreeze(structuredClone(grant)));
        return true;
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
