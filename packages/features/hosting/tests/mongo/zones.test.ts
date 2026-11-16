import { afterAll, beforeAll, expect, test } from "bun:test";
import { MongoClient } from "mongodb";
import type { CommandStartedEvent, Db } from "mongodb";
import { MongoHostingZoneStore } from "@bernouy/hosting/mongo";
import type { HostingZone } from "@bernouy/hosting";

const url = process.env.ULVIA_HOSTING_MONGO_URL;
const integration = url ? test : test.skip;
let client: MongoClient;
let db: Db;
let store: MongoHostingZoneStore;
const commands: CommandStartedEvent[] = [];

beforeAll(async () => {
    if (!url) {
        return;
    }
    client = new MongoClient(url, { monitorCommands: true });
    client.on("commandStarted", (event) => commands.push(event));
    await client.connect();
    db = client.db(`hosting_zones_test_${crypto.randomUUID().replaceAll("-", "")}`);
    store = new MongoHostingZoneStore(db);
    await store.init();
});

afterAll(async () => {
    if (client) {
        if (db) {
            await db.dropDatabase();
        }
        await client.close();
    }
});

function zone(hostname: string, controlInstanceId = "control"): HostingZone {
    return {
        format: "ulvia-hosting-zone/v1",
        hostname,
        controlInstanceId,
        claimId: crypto.randomUUID(),
        state: "pending",
        revision: 1,
    };
}

integration("Mongo zone claims and transitions are exclusive across processes and survive reopening", async () => {
    const other = new MongoHostingZoneStore(db);
    const first = zone("race.example");
    const claims = await Promise.allSettled([store.claimZone(first), other.claimZone(zone(first.hostname, "foreign"))]);
    expect(claims.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const current = (await other.getZone(first.hostname))!;
    const transitions = await Promise.allSettled([
        store.replaceZone(1, { ...current, state: "verified", revision: 2 }),
        other.replaceZone(1, { ...current, state: "disabled", revision: 2 }),
    ]);
    expect(transitions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const after = (await store.getZone(first.hostname))!;
    expect(await other.getZone(first.hostname)).toEqual(after);
    await expect(
        store.replaceZone(after.revision, { ...after, controlInstanceId: "stolen", revision: 3 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await store.getZone(first.hostname)).toEqual(after);
});

integration("Mongo zone pagination and admission use indexed bounded queries with Control isolation", async () => {
    for (const name of ["a", "b", "c", "d"]) {
        const pending = await store.claimZone(zone(`${name}.pages.example`, "pages"));
        await store.replaceZone(1, { ...pending, state: "verified", revision: 2 });
    }
    await store.claimZone(zone("foreign.pages.example", "other"));
    commands.length = 0;
    const first = await store.listZones({ controlInstanceId: "pages", after: null, limit: 2 });
    expect(first.items.map((item) => item.hostname)).toEqual(["a.pages.example", "b.pages.example"]);
    const finds = commands.filter((event) => event.commandName === "find");
    expect(finds).toHaveLength(1);
    expect(finds[0]!.command.limit).toBe(3);
    expect(finds[0]!.command.filter).toEqual({ controlInstanceId: "pages" });
    const second = await store.listZones({ controlInstanceId: "pages", after: first.nextCursor, limit: 2 });
    expect(second.items.map((item) => item.hostname)).toEqual(["c.pages.example", "d.pages.example"]);
    expect(second.nextCursor).toBeNull();
    commands.length = 0;
    const candidates = ["site.a.pages.example", "a.pages.example", "pages.example"];
    const admitted = await store.findVerifiedZone("pages", candidates);
    expect(admitted?.hostname).toBe("a.pages.example");
    expect(commands.filter((event) => event.commandName === "find")).toHaveLength(1);
    expect(commands[0]!.command.limit).toBe(1);
    expect(JSON.stringify(admitted).length).toBeLessThan(512);
    expect(await store.findVerifiedZone("other", candidates)).toBeNull();
    const plan = await db
        .collection("ulvia_hosting_zones")
        .find({
            controlInstanceId: "pages",
            hostname: { $in: candidates },
            state: "verified",
        })
        .limit(1)
        .explain("executionStats");
    expect(plan.executionStats.totalDocsExamined).toBe(1);
    expect(plan.executionStats.totalKeysExamined).toBeLessThanOrEqual(candidates.length);
    const pagePlan = await db
        .collection("ulvia_hosting_zones")
        .find({ controlInstanceId: "pages" })
        .sort({ hostname: 1 })
        .limit(3)
        .explain("executionStats");
    expect(pagePlan.executionStats.totalDocsExamined).toBe(3);
    expect(pagePlan.executionStats.totalKeysExamined).toBe(3);
});

integration("Mongo refuses malformed persisted zone state without repairing or replacing it", async () => {
    const valid = await store.claimZone(zone("invalid.example"));
    await db.collection("ulvia_hosting_zones").updateOne({ hostname: valid.hostname }, { $unset: { claimId: "" } });
    await expect(store.getZone(valid.hostname)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(store.claimZone(zone(valid.hostname))).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(store.replaceZone(1, { ...valid, state: "verified", revision: 2 })).rejects.toMatchObject({
        code: "UNAVAILABLE",
    });
    const unchanged = await db.collection("ulvia_hosting_zones").findOne({ hostname: valid.hostname });
    expect(unchanged).not.toHaveProperty("claimId");
    expect(unchanged!.revision).toBe(1);
    expect(unchanged!.state).toBe("pending");
});
