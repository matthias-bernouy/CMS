import type { CollectionPageExecutionConsumer, StoredCollectionPageExecutionGrant } from "./PageExecution";

export interface CollectionPageExecutionGrantStore {
    get(consumer: CollectionPageExecutionConsumer): Promise<StoredCollectionPageExecutionGrant | null>;
    replace(grant: StoredCollectionPageExecutionGrant, expectedRevision: number): Promise<boolean>;
}
