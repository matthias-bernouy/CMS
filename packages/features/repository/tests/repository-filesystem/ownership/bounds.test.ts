import { expect, test } from "bun:test";
import { MAX_ACCOUNT_NAMESPACES } from "repository/repository/namespaces/accounts/validation";
import { MongoRepositoryNamespaces } from "repository/repository/namespaces/accounts/mongo";
import { mongo, ownershipFixture } from "./fixture";

test.skipIf(!mongo)(
    "namespace quotas are atomic and listing performs one indexed bounded read",
    async () => {
        const f = await ownershipFixture();
        try {
            const claims = await Promise.allSettled(
                Array.from({ length: MAX_ACCOUNT_NAMESPACES + 8 }, (_, index) =>
                    f.namespaces.claim("account-a", `package-${index}`),
                ),
            );
            expect(claims.filter(({ status }) => status === "fulfilled")).toHaveLength(MAX_ACCOUNT_NAMESPACES);
            expect(claims.filter(({ status }) => status === "rejected")).toHaveLength(8);
            f.commands.length = 0;
            const listed = await f.namespaces.listOwned("account-a");
            expect(listed).toHaveLength(MAX_ACCOUNT_NAMESPACES);
            const reads = f.commands.filter(({ commandName }) => commandName === "find" || commandName === "getMore");
            expect(reads).toHaveLength(1);
            expect(reads[0]?.command).toMatchObject({
                find: "repository_namespaces",
                filter: { ownerAccountId: "account-a" },
                limit: MAX_ACCOUNT_NAMESPACES + 1,
            });
            expect(JSON.stringify(listed)).not.toContain("ownerAccountId");
            const plan = await f.db
                .collection("repository_namespaces")
                .find({ ownerAccountId: "account-a" })
                .sort({ namespace: 1 })
                .limit(MAX_ACCOUNT_NAMESPACES + 1)
                .explain("executionStats");
            expect(plan.executionStats.totalDocsExamined).toBe(MAX_ACCOUNT_NAMESPACES);
            expect(JSON.stringify(plan.queryPlanner.winningPlan)).toContain('"stage":"IXSCAN"');
            f.commands.length = 0;
            const other = await f.namespaces.claim("account-b", "example--other--package");
            expect(f.commands.map(({ commandName }) => commandName)).toEqual(["find", "aggregate", "update"]);
            f.commands.length = 0;
            await f.namespaces.execute("account-b", "example--other--package", 1, async () => undefined);
            expect(f.commands.map(({ commandName }) => commandName)).toEqual(["find"]);
            await expect(f.namespaces.transfer("account-b", "example--other--package", 1, "account-a")).rejects.toThrow(
                "limit",
            );
            expect(await f.namespaces.get("example--other--package")).toEqual(other);

            const otherDb = f.client.db(`${f.db.databaseName}-other`);
            try {
                const secondInstance = new MongoRepositoryNamespaces(otherDb, {
                    exclusive: async (_key, operation) => operation(),
                });
                await secondInstance.init();
                expect(await secondInstance.get("example--other--package")).toBeNull();
                expect(await secondInstance.listOwned("account-a")).toEqual([]);
            } finally {
                await otherDb.dropDatabase();
            }
        } finally {
            await f.close();
        }
    },
    30_000,
);
