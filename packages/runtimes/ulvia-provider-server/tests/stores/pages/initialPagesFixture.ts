import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/content";
import { seedOfficialPages } from "../../../src/runtime/instances/profiles/seedPages";

export function initialPagesFixture() {
    const repo = new ValidatingContentRepository(new InMemoryContentRepository());
    const records = new Map<string, Record<string, unknown>>();
    let interruptCompletion = false;
    const receipts = {
        findOne: async ({ _id }: { _id: string }) => records.get(_id) ?? null,
        insertOne: async (record: { _id: string }) => {
            if (records.has(record._id)) {
                throw new Error("Duplicate receipt");
            }
            records.set(record._id, { ...record });
        },
        updateOne: async (
            { _id }: { _id: string },
            update: { $set: Record<string, unknown>; $unset?: Record<string, string> },
        ) => {
            if (interruptCompletion && update.$set.completed) {
                interruptCompletion = false;
                throw new Error("Interrupted receipt write");
            }
            const record = { ...records.get(_id), ...update.$set };
            for (const key of Object.keys(update.$unset ?? {})) {
                delete record[key];
            }
            records.set(_id, record);
        },
    };
    const release = {
        collectionId: "example/demo",
        locale: "en",
        blocs: [],
        texts: [],
        translations: { en: { name: "Login", description: "Sign in" } },
        examples: [{ id: "login", document: { html: "" } }],
    };
    const composition = {
        stores: {
            repo,
            db: { collection: () => receipts },
            collections: {
                snapshot: async () => ({ collections: [{ collectionId: "example/demo", digest: "exact", release }] }),
            },
        },
    };
    const profile = {
        id: "test",
        collections: [{ collectionId: "example/demo", digest: "exact" }],
        initialPages: [
            {
                collectionId: "example/demo",
                indexing: false,
                id: "login",
                path: "/login",
                title: "name",
                description: "description",
                exampleId: "login",
            },
        ],
    };
    const execution = { throwIfLeaseLost: () => {} };
    const seed = () => seedOfficialPages(composition as never, profile as never, execution as never);
    return {
        repo,
        records,
        receipts,
        release,
        profile,
        seed,
        execution,
        interrupt: () => {
            interruptCompletion = true;
        },
    };
}
