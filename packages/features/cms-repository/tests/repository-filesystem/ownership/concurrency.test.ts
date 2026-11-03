import { expect, test } from "bun:test";
import { RepositoryNamespaces } from "@bernouy/cms-repository/repository/namespaces";
import { MongoRepositoryNamespaces } from "@bernouy/cms-repository/repository/namespaces/mongo";
import { withRepositoryWriteLock } from "@bernouy/cms-repository/repository/filesystem";
import { join } from "node:path";
import { deferred, mongo, ownershipFixture } from "./fixture";

test.skipIf(!mongo)("concurrent account claims cannot take the same namespace", async () => {
    const f = await ownershipFixture();
    try {
        const claims = await Promise.allSettled([
            f.namespaces.claim("account-a", "competing"),
            f.namespaces.claim("account-b", "competing"),
        ]);
        expect(claims.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
        expect(claims.filter(({ status }) => status === "rejected")).toHaveLength(1);
        expect((await f.store.get("competing"))?.revision).toBe(1);
    } finally {
        await f.close();
    }
});

test.skipIf(!mongo)(
    "account deletion holds the same fence as claims and performs no partial deletion on refusal",
    async () => {
        const f = await ownershipFixture();
        const entered = deferred();
        const proceed = deferred();
        try {
            const deletion = f.namespaces.withoutOwnedNamespaces("account-a", async () => {
                entered.resolve();
                await proceed.promise;
                f.accounts.delete("account-a");
            });
            await entered.promise;
            const claim = f.namespaces.claim("account-a", "during-deletion");
            proceed.resolve();
            await deletion;
            await expect(claim).rejects.toThrow("unavailable");
            expect(await f.namespaces.get("during-deletion")).toBeNull();
            await f.namespaces.claim("account-b", "retained");
            let deletedCredentials = false;
            await expect(
                f.namespaces.withoutOwnedNamespaces("account-b", async () => {
                    deletedCredentials = true;
                    f.accounts.delete("account-b");
                }),
            ).rejects.toThrow("Transfer owned");
            expect(deletedCredentials).toBe(false);
            expect(f.accounts.has("account-b")).toBe(true);
        } finally {
            proceed.resolve();
            await f.close();
        }
    },
);

test.skipIf(!mongo)(
    "publication and transfer share a namespace fence; the next stage refuses an old owner revision",
    async () => {
        const f = await ownershipFixture();
        const entered = deferred();
        const proceed = deferred();
        const transferRequested = deferred();
        let publication: Promise<void> | undefined;
        try {
            await f.namespaces.claim("account-a", "uploaded");
            publication = f.namespaces.execute("account-a", "uploaded", 1, async () => {
                entered.resolve();
                await proceed.promise;
            });
            await entered.promise;
            const secondStore = new MongoRepositoryNamespaces(f.db, {
                exclusive: (key, operation) => {
                    if (key === "namespace:uploaded") {
                        transferRequested.resolve();
                    }
                    return withRepositoryWriteLock(join(f.directory, key.replace(":", "-")), operation);
                },
            });
            const secondHost = new RepositoryNamespaces(secondStore, { exists: async (id) => f.accounts.has(id) });
            const transfer = secondHost.transfer("account-a", "uploaded", 1, "account-b");
            await transferRequested.promise;
            expect((await f.store.get("uploaded"))?.ownerAccountId).toBe("account-a");
            proceed.resolve();
            await publication;
            expect((await transfer).revision).toBe(2);
            let finalized = false;
            await expect(
                f.namespaces.execute("account-a", "uploaded", 1, async () => {
                    finalized = true;
                }),
            ).rejects.toThrow("stale");
            expect(finalized).toBe(false);
            expect(await f.namespaces.execute("account-b", "uploaded", 2, async () => "allowed")).toBe("allowed");
        } finally {
            proceed.resolve();
            await publication;
            await f.close();
        }
    },
);
