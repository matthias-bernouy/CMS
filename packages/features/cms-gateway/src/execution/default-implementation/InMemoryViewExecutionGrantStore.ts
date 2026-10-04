import { deepFreeze } from "@bernouy/cms-repository/contracts/protocol";
import type { CollectionViewExecutionGrantStore } from "../interfaces/ViewExecutionGrantStore";
import type { CollectionViewExecutionConsumer, StoredCollectionViewExecutionGrant } from "../interfaces/ViewExecution";

export class InMemoryCollectionViewExecutionGrantStore implements CollectionViewExecutionGrantStore {
    readonly #records = new Map<string, StoredCollectionViewExecutionGrant>();

    async get(consumer: CollectionViewExecutionConsumer): Promise<StoredCollectionViewExecutionGrant | null> {
        const record = this.#records.get(key(consumer));
        return record ? deepFreeze(structuredClone(record)) : null;
    }

    async replace(grant: StoredCollectionViewExecutionGrant, expectedRevision: number): Promise<boolean> {
        const id = key(grant.plan.consumer);
        if ((this.#records.get(id)?.revision ?? 0) !== expectedRevision || grant.revision !== expectedRevision + 1) {
            return false;
        }
        this.#records.set(id, deepFreeze(structuredClone(grant)));
        return true;
    }
}

function key(consumer: CollectionViewExecutionConsumer): string {
    return JSON.stringify([consumer.siteId, consumer.publisherId, consumer.collectionId, consumer.viewId]);
}
