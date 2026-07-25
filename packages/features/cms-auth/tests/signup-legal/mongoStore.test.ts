import { describe, expect, test } from "bun:test";
import type { Db } from "mongodb";
import type { SignupLegalAcceptance } from "@bernouy/cms-auth";
import { MongoSignupLegalAcceptanceStore } from "@bernouy/cms-auth/mongo";

describe("MongoSignupLegalAcceptanceStore", () => {
    test("keeps duplicate acknowledgements idempotent without overwriting evidence", async () => {
        const documents = new Map<string, Record<string, unknown>>();
        const collection = {
            insertOne: async (document: Record<string, unknown>) => {
                const id = document._id as string;
                if (documents.has(id)) {
                    throw Object.assign(new Error("duplicate"), { code: 11000 });
                }
                documents.set(id, structuredClone(document));
            },
            findOne: async ({ _id }: { _id: string }) => structuredClone(documents.get(_id) ?? null),
            find: ({ cmsUserId }: { cmsUserId: string }) => ({
                sort: () => ({
                    toArray: async () =>
                        structuredClone([...documents.values()].filter((entry) => entry.cmsUserId === cmsUserId)),
                }),
            }),
        };
        const db = { collection: () => collection } as unknown as Db;
        const store = new MongoSignupLegalAcceptanceStore(db);
        const first = acceptance();

        await store.append(first);
        await store.append({ ...first, acceptedAt: new Date("2026-07-26T10:00:00.000Z") });
        await store.append({ ...first, id: "proof-2" });

        expect(await store.listForUser(first.cmsUserId)).toEqual([first, { ...first, id: "proof-2" }]);
        await expect(
            store.append({
                ...first,
                documents: [{ ...first.documents[0]!, consentText: "Contradictory consent" }],
            }),
        ).rejects.toThrow("conflicts with different immutable evidence");
    });
});

export function acceptance(): SignupLegalAcceptance {
    return {
        id: "proof-1",
        cmsUserId: "local:user-1",
        acceptedAt: new Date("2026-07-25T10:00:00.000Z"),
        documents: [
            {
                documentKey: "terms",
                versionId: "a".repeat(64),
                label: "Terms",
                consentText: "I accept.",
                pageSnapshot: {
                    id: "page-1",
                    path: "/terms",
                    title: "Terms",
                    description: "",
                    content: "<p>Terms</p>",
                },
                pageSnapshotCanonical:
                    '{"id":"page-1","path":"/terms","title":"Terms","description":"","content":"<p>Terms</p>"}',
                contentHash: "b".repeat(64),
            },
        ],
    };
}
