import { expect, test } from "bun:test";
import { MongoClient } from "mongodb";
import type { CommandStartedEvent } from "mongodb";
import { MongoHostingStore } from "@bernouy/hosting/mongo";

const url = process.env.ULVIA_HOSTING_MONGO_URL;
const integration = url ? test : test.skip;
integration(
    "delivery pages seek the unique hostname index and load only limit plus one across all domain states",
    async () => {
        const client = new MongoClient(url!, { monitorCommands: true });
        const commands: CommandStartedEvent[] = [];
        client.on("commandStarted", (event) => commands.push(event));
        await client.connect();
        const db = client.db(`ulvia_tls_pages_${crypto.randomUUID().replaceAll("-", "")}`);
        try {
            const store = new MongoHostingStore(db);
            await store.init();
            for (const hostname of ["a-a.example", "a.example", "aa.example", "b.example"]) {
                await store.claimDomain({
                    hostname,
                    origin: `https://${hostname}`,
                    instanceId: "instance:one",
                    claimId: crypto.randomUUID(),
                    creationFingerprint: null,
                    state: "verified",
                    tls: "pending",
                    revision: 1,
                });
            }
            commands.length = 0;
            const first = await store.scanDomains({ after: null, limit: 2 });
            const second = await store.scanDomains({ after: first.nextCursor, limit: 2 });
            expect(first.items.map(({ hostname }) => hostname)).toEqual(["a-a.example", "a.example"]);
            expect(second.items.map(({ hostname }) => hostname)).toEqual(["aa.example", "b.example"]);
            expect(second.nextCursor).toBeNull();
            const finds = commands.filter(({ commandName }) => commandName === "find");
            expect(finds).toHaveLength(2);
            expect(finds.every(({ command }) => command.limit === 3 && command.projection._id === 0)).toBe(true);
            expect(finds[1]!.command.filter).toEqual({ hostname: { $gt: "a.example" } });
            const plan = await db
                .collection("ulvia_hosting_domains")
                .find({ hostname: { $gt: "a.example" } })
                .sort({ hostname: 1 })
                .limit(3)
                .explain("executionStats");
            expect(plan.executionStats.totalDocsExamined).toBe(2);
            expect(plan.executionStats.totalKeysExamined).toBe(2);
            commands.length = 0;
            await expect(store.scanDomains({ after: null, limit: 51 })).rejects.toThrow();
            expect(commands).toHaveLength(0);
        } finally {
            await db.dropDatabase();
            await client.close();
        }
    },
);
