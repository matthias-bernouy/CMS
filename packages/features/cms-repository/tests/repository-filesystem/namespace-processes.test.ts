import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { mongo, ownershipFixture } from "./ownership/fixture";

test.skipIf(!mongo)(
    "account namespace claims serialize across real Bun processes and persist one Mongo owner",
    async () => {
        const f = await ownershipFixture();
        const url = new URL(mongo!);
        url.pathname = `/${f.db.databaseName}`;
        const script = `
import { MongoClient } from "mongodb";
import { join } from "node:path";
import { RepositoryNamespaces } from "@bernouy/cms-repository/repository/namespaces";
import { MongoRepositoryNamespaces } from "@bernouy/cms-repository/repository/namespaces/mongo";
import { withRepositoryWriteLock } from "@bernouy/cms-repository/repository/filesystem";
const client = new MongoClient(process.env.ULVIA_TEST_MONGO_URL);
try {
    await client.connect();
    const store = new MongoRepositoryNamespaces(client.db(), {
        exclusive: (key, operation) => withRepositoryWriteLock(join(process.env.ULVIA_TEST_NAMESPACE_ROOT, key.replace(":", "-")), operation),
    });
    const service = new RepositoryNamespaces(store, { exists: async (id) => ["account-a", "account-b"].includes(id) });
    await service.claim(process.env.ULVIA_TEST_ACCOUNT, "community");
} catch (error) {
    process.exitCode = error.code === "REJECTED" ? 2 : 3;
} finally {
    await client.close();
}`;
        try {
            const children = ["account-a", "account-b"].map((accountId) =>
                Bun.spawn([process.execPath, "--no-macros", "-e", script], {
                    cwd: resolve(import.meta.dir, "../../../../.."),
                    env: {
                        ...process.env,
                        ULVIA_TEST_MONGO_URL: url.href,
                        ULVIA_TEST_NAMESPACE_ROOT: f.directory,
                        ULVIA_TEST_ACCOUNT: accountId,
                    },
                    stdout: "ignore",
                    stderr: "pipe",
                }),
            );
            const results = await Promise.all(
                children.map(async (child) => {
                    await new Response(child.stderr).text();
                    return child.exited;
                }),
            );
            expect(results.sort()).toEqual([0, 2]);
            expect(await f.db.collection("repository_namespaces").countDocuments()).toBe(1);
            const record = await f.store.get("community");
            expect(["account-a", "account-b"]).toContain(record?.ownerAccountId);
            expect(record?.revision).toBe(1);
            expect((await f.namespaces.get("community"))?.state).toBe("active");
        } finally {
            await f.close();
        }
    },
);
