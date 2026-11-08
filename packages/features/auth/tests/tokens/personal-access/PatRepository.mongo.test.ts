import { expect, test } from "bun:test";
import { MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";
import { MongoPatRepository } from "@bernouy/auth/mongo";
import { MAX_PERSONAL_ACCESS_TOKENS, PersonalAccessTokenLimitError } from "@bernouy/auth";

const mongo = process.env.ULVIA_AUTH_TEST_MONGO_URL;
test.skipIf(!mongo)(
    "Mongo PAT quotas are atomic, tokens are hashed, and access is isolated by account and instance",
    async () => {
        const client = new MongoClient(mongo!);
        const db = client.db(`ulvia-pat-test-${randomUUID()}`);
        try {
            await client.connect();
            const pats = new MongoPatRepository(db);
            const otherInstance = new MongoPatRepository(db, { collectionPrefix: "other_" });
            await pats.init();
            await otherInstance.init();
            const attempts = await Promise.allSettled(
                Array.from({ length: MAX_PERSONAL_ACCESS_TOKENS + 8 }, (_, index) =>
                    pats.create({ sub: "account-a", name: `token-${index}` }),
                ),
            );
            const created = attempts.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
            expect(created).toHaveLength(MAX_PERSONAL_ACCESS_TOKENS);
            for (const attempt of attempts) {
                if (attempt.status === "rejected") {
                    expect(attempt.reason).toBeInstanceOf(PersonalAccessTokenLimitError);
                }
            }
            expect(await pats.list("account-a")).toHaveLength(MAX_PERSONAL_ACCESS_TOKENS);
            const first = created[0]!;
            expect(await pats.verify(first.token)).toEqual({ sub: "account-a" });
            expect(await otherInstance.verify(first.token)).toBeNull();
            expect(await pats.revoke("account-b", first.pat.id)).toBe(false);
            const stored = JSON.stringify(await db.collection("personal_access_tokens").findOne({ _id: "account-a" }));
            expect(stored).toContain("hash");
            for (const value of created) {
                expect(stored).not.toContain(value.token);
            }
            expect(await pats.revoke("account-a", first.pat.id)).toBe(true);
            expect(await pats.verify(first.token)).toBeNull();
            await pats.create({ sub: "account-a", name: "replacement" });
            const expired = await pats.create({ sub: "account-b", name: "expired", expiresAt: new Date(0) });
            expect(await pats.verify(expired.token)).toBeNull();
            expect((await pats.list("account-b"))[0]?.lastUsedAt).toBeUndefined();
        } finally {
            await db.dropDatabase();
            await client.close();
        }
    },
    30_000,
);
