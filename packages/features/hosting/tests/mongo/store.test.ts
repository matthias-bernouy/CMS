import { afterAll, beforeAll, expect, test } from "bun:test";
import { MongoClient } from "mongodb";
import type { CommandStartedEvent, Db } from "mongodb";
import { MongoHostingStore } from "@bernouy/hosting/mongo";
import { reserveHostingInstallation } from "@bernouy/hosting";
import type { HostingDomain } from "@bernouy/hosting";

const url = process.env.ULVIA_HOSTING_MONGO_URL;
const integration = url ? test : test.skip;
let client: MongoClient;
let db: Db;
let store: MongoHostingStore;
const commands: CommandStartedEvent[] = [];

beforeAll(async () => {
    if (!url) {
        return;
    }
    client = new MongoClient(url, { monitorCommands: true });
    client.on("commandStarted", (event) => commands.push(event));
    await client.connect();
    db = client.db(`ulvia_hosting_test_${crypto.randomUUID().replaceAll("-", "")}`);
    store = new MongoHostingStore(db);
    await store.init();
});

afterAll(async () => {
    if (client) {
        await db.dropDatabase();
        await client.close();
    }
});

function domain(hostname: string, instanceId: string): HostingDomain {
    return {
        hostname,
        instanceId,
        origin: `https://${hostname}`,
        claimId: crypto.randomUUID(),
        creationFingerprint: null,
        state: "pending",
        tls: "pending",
        revision: 1,
    };
}

integration("Mongo atomically reserves a single installation and immutable Control binding", async () => {
    const results = await Promise.all(
        Array.from({ length: 16 }, () => reserveHostingInstallation(store, "https://control.example")),
    );
    expect(new Set(results.map((item) => item.controlKey)).size).toBe(1);
    const bindings = await Promise.allSettled([store.bindControl(1, "control-a"), store.bindControl(1, "control-b")]);
    expect(bindings.filter((value) => value.status === "fulfilled")).toHaveLength(1);
    const installation = await store.readInstallation();
    const other = installation!.controlInstanceId === "control-a" ? "control-b" : "control-a";
    await expect(store.bindControl(installation!.revision, other)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await store.readInstallation()).toEqual(installation);
});

integration("Mongo domain ownership and revisions survive competing writers", async () => {
    const a = domain("race.example", "a");
    const results = await Promise.allSettled([store.claimDomain(a), store.claimDomain(domain(a.hostname, "b"))]);
    expect(results.filter((value) => value.status === "fulfilled")).toHaveLength(1);
    const current = (await store.getDomain(a.hostname))!;
    const replacements = await Promise.allSettled([
        store.replaceDomain(1, { ...current, state: "verified", revision: 2 }),
        store.replaceDomain(1, { ...current, state: "disabled", revision: 2 }),
    ]);
    expect(replacements.filter((value) => value.status === "fulfilled")).toHaveLength(1);
    const final = await store.getDomain(a.hostname);
    await expect(store.replaceDomain(2, { ...final!, instanceId: "foreign", revision: 3 })).rejects.toMatchObject({
        code: "CONFLICT",
    });
    expect(await store.getDomain(a.hostname)).toEqual(final);
});

integration("Mongo lookup and pagination use bounded indexed queries", async () => {
    for (const name of ["a", "b", "c", "d"]) {
        await store.claimDomain(domain(`${name}.pages.example`, "pagination"));
    }
    await store.claimDomain(domain("foreign.pages.example", "foreign"));
    commands.length = 0;
    const first = await store.listDomains({ instanceId: "pagination", after: null, limit: 2 });
    expect(first.items.map((item) => item.hostname)).toEqual(["a.pages.example", "b.pages.example"]);
    expect(first.nextCursor).toBe("b.pages.example");
    const finds = commands.filter((event) => event.commandName === "find");
    expect(finds).toHaveLength(1);
    expect(finds[0]!.command.limit).toBe(3);
    expect(finds[0]!.command.filter).toEqual({ instanceId: "pagination" });
    const next = await store.listDomains({ instanceId: "pagination", after: first.nextCursor, limit: 2 });
    expect(next.items.map((item) => item.hostname)).toEqual(["c.pages.example", "d.pages.example"]);
    expect(next.nextCursor).toBeNull();
    commands.length = 0;
    await store.getDomain("a.pages.example");
    expect(commands.filter((event) => event.commandName === "find")).toHaveLength(1);
    expect(commands[0]!.command.filter).toEqual({ hostname: "a.pages.example" });
    const plan = await db
        .collection("ulvia_hosting_domains")
        .find({ hostname: "a.pages.example" })
        .explain("executionStats");
    expect(plan.executionStats.totalDocsExamined).toBe(1);
    expect(plan.executionStats.totalKeysExamined).toBe(1);
});

integration("Mongo creation requests cannot reserve two domains or change their fingerprint", async () => {
    const first = { ...domain("first.creation.example", "creation"), creationFingerprint: "a".repeat(43) };
    await store.claimDomain(first);
    await expect(
        store.claimDomain({ ...first, hostname: "second.creation.example", origin: "https://second.creation.example" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(store.claimDomain({ ...first, creationFingerprint: "b".repeat(43) })).rejects.toMatchObject({
        code: "CONFLICT",
    });
    expect(await store.getDomain("second.creation.example")).toBeNull();
    expect(await store.getDomain(first.hostname)).toEqual(first);
});

integration("Mongo installation completion is revision checked and retains Control identity", async () => {
    const before = (await store.readInstallation())!;
    const results = await Promise.allSettled([
        store.completeInstallation(before.revision),
        store.completeInstallation(before.revision),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const after = (await store.readInstallation())!;
    expect(after).toMatchObject({
        phase: "ready",
        controlInstanceId: before.controlInstanceId,
        revision: before.revision + 1,
    });
    await expect(store.completeInstallation(before.revision)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await store.readInstallation()).toEqual(after);
});

integration("malformed persisted Control state refuses binding without repairing missing fields", async () => {
    const before = await db.collection("ulvia_hosting_installation").findOne({ id: "installation" });
    await db
        .collection("ulvia_hosting_installation")
        .updateOne({ id: "installation" }, { $unset: { controlInstanceId: "" } });
    await expect(store.bindControl(before!.revision, "replacement")).rejects.toThrow();
    const invalid = await db.collection("ulvia_hosting_installation").findOne({ id: "installation" });
    expect(invalid).not.toHaveProperty("controlInstanceId");
    expect(invalid!.revision).toBe(before!.revision);
});
