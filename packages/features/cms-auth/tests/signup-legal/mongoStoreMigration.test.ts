import { describe, expect, test } from "bun:test";
import type { Db } from "mongodb";
import { MongoSignupLegalAcceptanceStore } from "@bernouy/cms-auth/mongo";

describe("MongoSignupLegalAcceptanceStore index migration", () => {
    test("replaces the legacy unique user index with non-unique lookup indexes", async () => {
        const indexes = [
            { name: "_id_", key: { _id: 1 } },
            { name: "cmsUserId_1", key: { cmsUserId: 1 }, unique: true },
        ];
        const created: Array<{ keys: unknown; options: unknown }> = [];
        const dropped: string[] = [];
        const collection = {
            createIndex: async (keys: Record<string, number>, options?: unknown) => {
                created.push({ keys, options });
                const name = Object.entries(keys)
                    .map(([key, direction]) => `${key}_${direction}`)
                    .join("_");
                if (!indexes.some((index) => index.name === name)) {
                    indexes.push({ name, key: keys });
                }
                return name;
            },
            listIndexes: () => ({ toArray: async () => structuredClone(indexes) }),
            dropIndex: async (name: string) => {
                dropped.push(name);
                indexes.splice(
                    indexes.findIndex((index) => index.name === name),
                    1,
                );
            },
        };
        const db = { collection: () => collection } as unknown as Db;

        await new MongoSignupLegalAcceptanceStore(db).init();

        expect(dropped).toEqual(["cmsUserId_1"]);
        expect(created.map(({ keys }) => keys)).toEqual([{ "documents.versionId": 1 }, { cmsUserId: 1 }]);
        expect(indexes.find((index) => index.name === "cmsUserId_1")?.unique).toBeUndefined();
    });
});
