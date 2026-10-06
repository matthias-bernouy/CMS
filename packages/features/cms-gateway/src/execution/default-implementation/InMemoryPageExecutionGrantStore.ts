import { deepFreeze } from "@bernouy/cms-repository/contracts/protocol";
import type { PageExecutionGrantStore } from "../interfaces/PageExecutionGrantStore";
import type { PageExecutionConsumer, StoredPageExecutionGrant } from "../interfaces/PageExecution";

export class InMemoryPageExecutionGrantStore implements PageExecutionGrantStore {
    readonly #records = new Map<string, StoredPageExecutionGrant>();

    async get(consumer: PageExecutionConsumer): Promise<StoredPageExecutionGrant | null> {
        const record = this.#records.get(key(consumer));
        return record ? deepFreeze(structuredClone(record)) : null;
    }

    async replace(grant: StoredPageExecutionGrant, expectedRevision: number): Promise<boolean> {
        const id = key(grant.plan.consumer);
        if ((this.#records.get(id)?.revision ?? 0) !== expectedRevision || grant.revision !== expectedRevision + 1) {
            return false;
        }
        this.#records.set(id, deepFreeze(structuredClone(grant)));
        return true;
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
