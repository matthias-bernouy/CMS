import { describe, expect, test } from "bun:test";
import type { Db } from "mongodb";
import type { SignupLegalAcceptance } from "@bernouy/cms-auth";
import { MongoSignupLegalAcceptanceStore } from "@bernouy/cms-auth/mongo";

describe("MongoSignupLegalAcceptanceStore", () => {
    test("creates immutable-proof indexes and appends without upserting", async () => {
        const inserted: unknown[] = [];
        const indexes: unknown[] = [];
        const collection = {
            createIndex: async (keys: unknown, options?: unknown) => {
                indexes.push({ keys, options });
            },
            insertOne: async (document: unknown) => {
                inserted.push(structuredClone(document));
            },
            find: () => ({
                sort: () => ({
                    toArray: async () => structuredClone(inserted),
                }),
            }),
        };
        const names: string[] = [];
        const db = {
            collection: (name: string) => {
                names.push(name);
                return collection;
            },
        } as unknown as Db;
        const store = new MongoSignupLegalAcceptanceStore(db, { collectionPrefix: "tenant_" });
        const proof = acceptance();

        await store.init();
        await store.append(proof);
        expect(await store.listForUser("local:user-1")).toEqual([proof]);
        expect(names.every((name) => name === "tenant_signup_legal_acceptances")).toBe(true);
        expect(indexes).toEqual([
            { keys: { cmsUserId: 1 }, options: { unique: true } },
            { keys: { "documents.versionId": 1 }, options: undefined },
        ]);
        expect(inserted).toHaveLength(1);
    });
});

function acceptance(): SignupLegalAcceptance {
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
