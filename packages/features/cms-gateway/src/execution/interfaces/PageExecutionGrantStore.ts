import type { PageExecutionConsumer, StoredPageExecutionGrant } from "./PageExecution";

export interface PageExecutionGrantStore {
    get(consumer: PageExecutionConsumer): Promise<StoredPageExecutionGrant | null>;
    replace(grant: StoredPageExecutionGrant, expectedRevision: number): Promise<boolean>;
}
