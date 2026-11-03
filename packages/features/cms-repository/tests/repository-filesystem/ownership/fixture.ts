import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MongoClient } from "mongodb";
import { RepositoryNamespaces } from "@bernouy/cms-repository/repository/namespaces";
import { MongoRepositoryNamespaces } from "@bernouy/cms-repository/repository/namespaces/mongo";
import { withRepositoryWriteLock } from "@bernouy/cms-repository/repository/filesystem";

export const mongo = process.env.ULVIA_REPOSITORY_TEST_MONGO_URL;

export async function ownershipFixture() {
    const directory = await mkdtemp(join(tmpdir(), "ulvia-account-namespaces-"));
    const client = new MongoClient(mongo!, { monitorCommands: true });
    const db = client.db(`ulvia-namespace-${randomUUID()}`);
    const accounts = new Set(["account-a", "account-b"]);
    const commands: Array<{ commandName: string; command: Record<string, unknown> }> = [];
    client.on("commandStarted", (event) => commands.push(event));
    try {
        await client.connect();
        const store = new MongoRepositoryNamespaces(db, {
            exclusive: (key, operation) => withRepositoryWriteLock(join(directory, key.replace(":", "-")), operation),
        });
        await store.init();
        return {
            db,
            client,
            store,
            directory,
            commands,
            accounts,
            namespaces: new RepositoryNamespaces(store, { exists: async (id) => accounts.has(id) }),
            async close() {
                await db.dropDatabase();
                await client.close();
                await rm(directory, { recursive: true, force: true });
            },
        };
    } catch (error) {
        await client.close();
        await rm(directory, { recursive: true, force: true });
        throw error;
    }
}

export function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}
