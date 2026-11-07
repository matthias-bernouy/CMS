import type { Db } from "mongodb";
import type { KeyedExecution } from "@bernouy/ulvia-sdk/provider";
import { MongoKeyedReceiptStore } from "../../../src/runtime/provider-operations/keyed/MongoKeyedReceiptStore";
import { DurableKeyedExecution } from "../../../src/runtime/provider-operations/keyed/DurableKeyedExecution";

export const scope = { providerId: "ulvia/primary-provider", siteId: "default", instanceId: "instance-a" };
export const invocation = (): KeyedExecution => ({
    ...scope,
    contractId: "ulvia/cms.emailer.smtp",
    version: "1.0.0",
    capabilityId: "emailer.send",
    key: "send-1",
    input: { toEmail: "user@example.test", subject: "Hello", text: "Private email body" },
    context: {
        ...scope,
        requestId: crypto.randomUUID(),
        contractVersion: "1.0.0",
        actorKind: "administrator",
        subjectId: "admin-a",
        invocation: { contractId: "ulvia/cms.emailer.smtp", instanceId: scope.instanceId },
    },
});

/** Atomic collection double exercises the real Mongo adapter, including its write concerns and filters. */
export function receiptFixture() {
    type Document = { _id: string; fingerprint: string; state: string; outcome?: unknown };
    const documents = new Map<string, Document>();
    const calls = { insert: 0, find: 0, update: 0, retained: 0 };
    let failClaim = false;
    let failComplete = false;
    let collectionOptions: unknown;
    const db = {
        collection: (_name: string, options: unknown) => {
            collectionOptions = options;
            return {
                insertOne: async (document: Document) => {
                    calls.insert++;
                    if (failClaim) {
                        throw new Error("Uncertain durable claim");
                    }
                    if (documents.has(document._id)) {
                        throw Object.assign(new Error("duplicate"), { code: 11000 });
                    }
                    documents.set(document._id, structuredClone(document));
                },
                findOne: async ({ _id }: { _id: string }) => {
                    calls.find++;
                    return structuredClone(documents.get(_id) ?? null);
                },
                updateOne: async (filter: Document, patch: { $set: Partial<Document> }) => {
                    calls.update++;
                    if (failComplete) {
                        throw new Error("Uncertain completion");
                    }
                    const row = documents.get(filter._id);
                    if (!row || row.fingerprint !== filter.fingerprint || row.state !== filter.state) {
                        return { modifiedCount: 0 };
                    }
                    Object.assign(row, structuredClone(patch.$set));
                    return { modifiedCount: 1 };
                },
            };
        },
    } as unknown as Db;
    const store = new MongoKeyedReceiptStore(db);
    const executor = () =>
        new DurableKeyedExecution(store, scope, () => {
            calls.retained++;
            return () => {
                calls.retained--;
            };
        });
    return {
        documents,
        calls,
        store,
        executor,
        options: () => collectionOptions,
        failClaim: () => {
            failClaim = true;
        },
        failComplete: () => {
            failComplete = true;
        },
    };
}
