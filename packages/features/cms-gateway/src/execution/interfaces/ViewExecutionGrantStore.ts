import type { CollectionViewExecutionConsumer, StoredCollectionViewExecutionGrant } from "./ViewExecution";

export interface CollectionViewExecutionGrantStore {
    get(consumer: CollectionViewExecutionConsumer): Promise<StoredCollectionViewExecutionGrant | null>;
    replace(grant: StoredCollectionViewExecutionGrant, expectedRevision: number): Promise<boolean>;
}
